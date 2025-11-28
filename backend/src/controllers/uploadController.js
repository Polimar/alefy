import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { extractMetadata, saveCoverArt } from '../utils/audioMetadata.js';
import { getTrackStoragePath, ensureDirectoryExists, getStoragePath, getFileStats, isDuplicateFile } from '../utils/storage.js';
import { addTracksToPlaylist } from './youtubeController.js';
import { processTrack } from '../services/metadataBatchService.js';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

const uploadTracksSchema = z.object({
  playlistId: z.number().int().positive().optional(),
  playlistName: z.string().min(1).max(255).optional(),
}).refine(
  (data) => !(data.playlistId && data.playlistName),
  { message: 'playlistId e playlistName non possono essere entrambi specificati' }
);

export const uploadTracks = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new AppError('Nessun file caricato', 400);
    }

    // Valida parametri playlist se presenti
    let playlistId = null;
    let playlistName = null;
    if (req.body.playlistId || req.body.playlistName) {
      const validatedData = uploadTracksSchema.parse({
        playlistId: req.body.playlistId ? parseInt(req.body.playlistId, 10) : undefined,
        playlistName: req.body.playlistName || undefined,
      });
      playlistId = validatedData.playlistId || null;
      playlistName = validatedData.playlistName || null;
    }

    const userId = req.user.userId;
    const storagePath = getStoragePath();
    const uploadedTracks = [];

    // Processa file in batch per evitare saturazione RAM
    // Limite configurabile: max 3 file simultanei (default)
    const MAX_CONCURRENT_UPLOADS = parseInt(process.env.MAX_CONCURRENT_UPLOADS) || 3;
    const files = Array.from(req.files);
    
    // Processa file in batch
    for (let i = 0; i < files.length; i += MAX_CONCURRENT_UPLOADS) {
      const batch = files.slice(i, i + MAX_CONCURRENT_UPLOADS);
      
      // Processa batch in parallelo (limitato)
      const batchPromises = batch.map(async (file) => {
        try {
          // Extract metadata (carica file in memoria - limitiamo il batch)
          const metadata = await extractMetadata(file.path);
          
          // Forza garbage collection hint dopo estrazione metadati
          if (global.gc && i % 5 === 0) {
            global.gc();
          }

        // Determine final storage path
        const finalPath = getTrackStoragePath(userId, metadata.artist, metadata.album);
        await ensureDirectoryExists(finalPath);

        // Move file to final location
        const finalFilePath = path.join(finalPath, path.basename(file.path));
        const relativeFilePath = path.relative(storagePath, finalFilePath);

        // Verifica duplicati prima di spostare il file
        const isDuplicate = await isDuplicateFile(userId, relativeFilePath);
        if (isDuplicate) {
          console.warn(`[Upload] File duplicato ignorato: ${relativeFilePath}`);
          // Rimuovi il file temporaneo
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            // Ignora errori di cleanup
          }
          // Continua con il prossimo file senza bloccare
          continue;
        }

        await fs.rename(file.path, finalFilePath);

        // Get file stats
        const stats = await getFileStats(finalFilePath);

        // Save cover art if available
        let coverArtPath = null;
        if (metadata.picture) {
          coverArtPath = await saveCoverArt(
            metadata.picture,
            userId,
            metadata.album,
            storagePath
          );
        }

        // Insert track into database
        // Arrotonda i valori numerici a interi per evitare errori di tipo nel database
        const result = await pool.query(
          `INSERT INTO tracks (
            user_id, title, artist, album, album_artist, genre, year,
            track_number, disc_number, duration, file_path, file_size,
            file_format, bitrate, sample_rate, cover_art_path
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING id, title, artist, album, duration, file_size, created_at`,
          [
            userId,
            metadata.title,
            metadata.artist,
            metadata.album,
            metadata.albumArtist,
            metadata.genre,
            metadata.year,
            metadata.trackNumber,
            metadata.discNumber,
            Math.round(metadata.duration || 0), // Arrotonda duration a intero
            path.relative(storagePath, finalFilePath),
            stats?.size || 0,
            path.extname(finalFilePath).substring(1).toLowerCase(),
            metadata.bitrate ? Math.round(metadata.bitrate) : null, // Arrotonda bitrate a intero
            metadata.sampleRate ? Math.round(metadata.sampleRate) : null, // Arrotonda sampleRate a intero
            coverArtPath,
          ]
        );

          uploadedTracks.push(result.rows[0]);
          
          // Trigger processing metadati in background (non bloccante)
          processTrack(result.rows[0].id).catch(error => {
            console.error(`[Upload] Errore processing metadati per traccia ${result.rows[0].id}:`, error.message);
          });
          
          return { success: true, track: result.rows[0] };
        } catch (error) {
          // Clean up file on error
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            // Ignore cleanup errors
          }

          console.error(`Error processing file ${file.originalname}:`, error);
          return { success: false, error: error.message };
        }
      });
      
      // Attendi completamento batch prima di procedere
      const batchResults = await Promise.all(batchPromises);
      
      // Log progresso
      const successful = batchResults.filter(r => r.success).length;
      console.log(`[Upload] Batch ${Math.floor(i / MAX_CONCURRENT_UPLOADS) + 1}: ${successful}/${batch.length} file processati`);
      
      // Piccola pausa tra batch per permettere al GC di lavorare
      if (i + MAX_CONCURRENT_UPLOADS < files.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (uploadedTracks.length === 0) {
      throw new AppError('Nessun file processato con successo', 500);
    }

    // Gestisci playlist se specificata
    let finalPlaylistId = playlistId || null;
    if (playlistName) {
      // Crea nuova playlist
      const playlistResult = await pool.query(
        'INSERT INTO playlists (user_id, name, description, is_public) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, playlistName.trim(), null, false]
      );
      finalPlaylistId = playlistResult.rows[0].id;
    }

    // Aggiungi tracce alla playlist se specificata
    if (finalPlaylistId) {
      const trackIds = uploadedTracks.map(track => track.id);
      try {
        await addTracksToPlaylist(userId, finalPlaylistId, trackIds);
      } catch (playlistError) {
        console.error('Errore aggiunta tracce a playlist:', playlistError);
        // Non fallire l'upload se l'aggiunta alla playlist fallisce
      }
    }

    res.status(201).json({
      success: true,
      data: {
        tracks: uploadedTracks,
        count: uploadedTracks.length,
        playlistId: finalPlaylistId || null,
      },
    });
  } catch (error) {
    // Clean up any remaining temp files
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          // Ignore cleanup errors
        }
      }
    }
    next(error);
  }
};


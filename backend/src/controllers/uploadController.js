import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { extractMetadata, saveCoverArt } from '../utils/audioMetadata.js';
import { getTrackStoragePath, ensureDirectoryExists, getStoragePath, getFileStats } from '../utils/storage.js';
import fs from 'fs/promises';
import path from 'path';

export const uploadTracks = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new AppError('Nessun file caricato', 400);
    }

    const userId = req.user.userId;
    const storagePath = getStoragePath();
    const uploadedTracks = [];

    for (const file of req.files) {
      try {
        // Extract metadata
        const metadata = await extractMetadata(file.path);

        // Determine final storage path
        const finalPath = getTrackStoragePath(userId, metadata.artist, metadata.album);
        await ensureDirectoryExists(finalPath);

        // Move file to final location
        const finalFilePath = path.join(finalPath, path.basename(file.path));
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
            metadata.duration,
            path.relative(storagePath, finalFilePath),
            stats?.size || 0,
            path.extname(finalFilePath).substring(1).toLowerCase(),
            metadata.bitrate,
            metadata.sampleRate,
            coverArtPath,
          ]
        );

        uploadedTracks.push(result.rows[0]);
      } catch (error) {
        // Clean up file on error
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          // Ignore cleanup errors
        }

        console.error(`Error processing file ${file.originalname}:`, error);
        // Continue with other files
      }
    }

    if (uploadedTracks.length === 0) {
      throw new AppError('Nessun file processato con successo', 500);
    }

    res.status(201).json({
      success: true,
      data: {
        tracks: uploadedTracks,
        count: uploadedTracks.length,
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


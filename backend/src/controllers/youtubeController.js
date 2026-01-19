import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { extractMetadata, saveCoverArt, downloadThumbnail } from '../utils/audioMetadata.js';
import { getTrackStoragePath, ensureDirectoryExists, getStoragePath, getFileStats, isDuplicateFile } from '../utils/storage.js';
import downloadQueue from '../utils/downloadQueue.js';
import { detectAlbum } from '../utils/albumDetector.js';
import { parseTimestampsFromDescription } from '../utils/timestampParser.js';
import { splitAudioFile } from '../utils/audioSplitter.js';
import { searchTrackMetadata } from '../utils/metadataSearch.js';
import { getActiveCookiesPath } from './youtubeCookiesController.js';
import { processTrack } from '../services/metadataBatchService.js';
import { z } from 'zod';

const execAsync = promisify(exec);

const downloadSchema = z.object({
  url: z.string().url('URL non valido'),
  thumbnailUrl: z.string().url().optional().nullable(),
  playlistId: z.number().int().positive().optional(),
  playlistName: z.string().min(1).max(255).optional(),
  selectedTracks: z.array(z.object({
    startTime: z.number().min(0),
    endTime: z.number().min(0).nullable(),
    title: z.string().min(1),
  })).optional().nullable(), // Accetta anche null quando tutte le tracce sono selezionate
}).refine(
  (data) => !(data.playlistId && data.playlistName),
  { message: 'playlistId e playlistName non possono essere entrambi specificati' }
);

const searchSchema = z.object({
  q: z.string().min(1, 'Query di ricerca non può essere vuota'),
  limit: z.enum(['5', '10', '20', '50']).default('10'),
  albumOnly: z.enum(['true', 'false']).optional().default('false'),
});

export const downloadYouTube = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const validatedData = downloadSchema.parse(req.body);
    const { url, thumbnailUrl, playlistId, playlistName, selectedTracks } = validatedData;

    console.log(`[YouTube Download] Aggiunta job alla coda per URL: ${url}, User ID: ${userId}`);

    // Aggiungi il job alla coda invece di eseguire direttamente
    const jobId = downloadQueue.addJob(userId, {
      url,
      thumbnailUrl: thumbnailUrl || null,
      playlistId: playlistId || null,
      playlistName: playlistName || null,
      selectedTracks: selectedTracks || null,
    });

    res.status(202).json({
      success: true,
      data: {
        jobId,
        message: 'Download aggiunto alla coda',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

/**
 * Processa un job di download dalla coda usando spawn per progresso reale
 */
export async function processDownloadJob(job) {
  const { id: jobId, userId, url, thumbnailUrl, playlistId, playlistName, selectedTracks } = job;

  try {
    downloadQueue.updateJob(jobId, { 
      status: 'downloading', 
      progress: 0,
      statusMessage: 'Rilevamento album...'
    });

    console.log(`[YouTube Download] Inizio download job ${jobId} per URL: ${url}, User ID: ${userId}`);

    // Risolvi percorso yt-dlp
    let ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
    
    // Prima ottieni i metadati del video per rilevare se è un album
    console.log(`[YouTube Download] Job ${jobId}: Rilevamento album...`);
    let videoInfo = null;
    let albumInfo = null;
    let finalPlaylistId = playlistId || null;
    
    try {
      // Ottieni cookies attivi se disponibili
      const cookiesPath = await getActiveCookiesPath();
      const cookiesFlag = cookiesPath ? `--cookies "${cookiesPath}"` : '';
      
      if (cookiesPath) {
        console.log(`[YouTube Download] Job ${jobId}: Usando cookies da: ${cookiesPath}`);
      }
      
      const infoCommand = `${ytdlpPath} "${url}" --dump-json --no-playlist ${cookiesFlag}`.trim();
      const { stdout: infoStdout } = await execAsync(infoCommand, {
        maxBuffer: 5 * 1024 * 1024,
        timeout: 30000,
      });
      
      if (infoStdout) {
        videoInfo = JSON.parse(infoStdout.trim());
        const description = videoInfo.description || '';
        const duration = videoInfo.duration || 0;
        
        albumInfo = detectAlbum(duration, description);
        
        if (albumInfo.isAlbum) {
          console.log(`[YouTube Download] Job ${jobId}: Album rilevato con ${albumInfo.tracks.length} tracce`);
          downloadQueue.updateJob(jobId, { 
            isAlbum: true,
            tracksCount: albumInfo.tracks.length,
            statusMessage: `Album rilevato con ${albumInfo.tracks.length} tracce`,
          });
        }
      }
    } catch (infoError) {
      console.warn(`[YouTube Download] Job ${jobId}: Impossibile ottenere info video: ${infoError.message}`);
      // Continua comunque con il download
    }
    
    if (ytdlpPath.startsWith('/')) {
      try {
        await fs.access(ytdlpPath);
      } catch (error) {
        try {
          const { stdout } = await execAsync('which yt-dlp', { maxBuffer: 1024 });
          ytdlpPath = stdout.trim();
        } catch (pathError) {
          throw new Error('yt-dlp non è installato o non è nel PATH.');
        }
      }
    } else {
      try {
        const { stdout } = await execAsync(`which ${ytdlpPath}`, { maxBuffer: 1024 });
        ytdlpPath = stdout.trim();
      } catch (error) {
        throw new Error('yt-dlp non è installato o non è nel PATH.');
      }
    }
    
    const storagePath = getStoragePath();
    const tempDir = path.join(storagePath, 'temp', 'youtube');
    await ensureDirectoryExists(tempDir);

    const filesBefore = await fs.readdir(tempDir);
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `%(title)s-${timestamp}.%(ext)s`);

    console.log(`[YouTube Download] Job ${jobId}: Esecuzione yt-dlp con spawn...`);
    downloadQueue.updateJob(jobId, { 
      progress: 5,
      statusMessage: 'Download in corso...'
    });

    // Usa spawn invece di exec per leggere progresso in tempo reale
    const args = [
      '--no-playlist',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '192K',
      '--parse-metadata', 'title:%(artist)s - %(title)s',
      '--embed-metadata',
      '--progress',
      '-o', outputPath,
      url,
    ];

    await new Promise((resolve, reject) => {
      const process = spawn(ytdlpPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      // Parsa progresso da stderr
      process.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;

        // yt-dlp stampa il progresso su stderr nel formato:
        // [download] X.X% of Y at Z speed ETA XX:XX
        const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
        if (progressMatch) {
          const progress = parseFloat(progressMatch[1]);
          // Scala il progresso tra 5% e 90% (download effettivo)
          const scaledProgress = 5 + (progress * 0.85);
          downloadQueue.updateJob(jobId, { 
            progress: Math.min(scaledProgress, 90),
            statusMessage: 'Download in corso...'
          });
        }

        // Estrai velocità e ETA
        const speedMatch = output.match(/at\s+([\d.]+[KMGT]?i?B\/s)/);
        const etaMatch = output.match(/ETA\s+(\d+:\d+)/);
        
        if (speedMatch || etaMatch) {
          const updates = {};
          if (speedMatch) updates.speed = speedMatch[1];
          if (etaMatch) updates.eta = etaMatch[1];
          downloadQueue.updateJob(jobId, updates);
        }
      });

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          const errorMessage = stderr.includes('ERROR')
            ? stderr.split('ERROR')[1]?.substring(0, 200) || 'Errore sconosciuto'
            : 'Errore durante il download';
          reject(new Error(errorMessage));
          return;
        }
        resolve();
      });

      process.on('error', (error) => {
        reject(error);
      });
    });

    console.log(`[YouTube Download] Job ${jobId}: Download completato, ricerca file...`);

    // Trova il file scaricato
    const filesAfter = await fs.readdir(tempDir);
    const newFiles = filesAfter.filter(f => !filesBefore.includes(f));
    
    let downloadedFile = null;
    
    if (newFiles.length > 0) {
      downloadedFile = newFiles[0];
    } else {
      const filesByTimestamp = filesAfter.filter(f => f.includes(timestamp.toString()));
      if (filesByTimestamp.length > 0) {
        const testPath = path.join(tempDir, filesByTimestamp[0]);
        const stats = await fs.stat(testPath);
        if (stats.isFile()) {
          downloadedFile = filesByTimestamp[0];
        }
      }
    }
    
    if (!downloadedFile) {
      throw new Error('File scaricato non trovato.');
    }

    const filePath = path.join(tempDir, downloadedFile);

    // Estrai metadati base
    console.log(`[YouTube Download] Job ${jobId}: Estrazione metadati...`);
    downloadQueue.updateJob(jobId, { 
      progress: 90,
      statusMessage: 'Estrazione metadati...'
    });
    const metadata = await extractMetadata(filePath);
    
    // Gestisci creazione playlist se necessario
    if (playlistName && !finalPlaylistId) {
      console.log(`[YouTube Download] Job ${jobId}: Creazione playlist "${playlistName}"...`);
      downloadQueue.updateJob(jobId, { 
        statusMessage: `Creazione playlist "${playlistName}"...`
      });
      
      const playlistResult = await pool.query(
        'INSERT INTO playlists (user_id, name, description, is_public) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, playlistName, null, false]
      );
      finalPlaylistId = playlistResult.rows[0].id;
    }
    
    // Verifica playlist esistente se necessario
    if (finalPlaylistId) {
      const playlistCheck = await pool.query(
        'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
        [finalPlaylistId, userId]
      );
      if (playlistCheck.rows.length === 0) {
        console.warn(`[YouTube Download] Job ${jobId}: Playlist ${finalPlaylistId} non trovata o non autorizzata`);
        finalPlaylistId = null;
      }
    }

    // Se è un album O se ci sono tracce selezionate manualmente, dividilo in tracce
    let tracksToSplit = null;
    
    if (albumInfo && albumInfo.isAlbum && albumInfo.tracks.length > 0) {
      // Album rilevato automaticamente
      tracksToSplit = albumInfo.tracks;
      if (selectedTracks && selectedTracks.length > 0) {
        // Filtra le tracce rilevate per includere solo quelle selezionate
        // Matching più flessibile: confronta startTime (tolleranza 2 secondi) e titolo (case-insensitive, rimuovi spazi extra)
        tracksToSplit = albumInfo.tracks.filter(track => 
          selectedTracks.some(st => {
            const timeMatch = Math.abs(st.startTime - track.startTime) < 2; // Tolleranza 2 secondi
            const titleMatch = st.title.trim().toLowerCase().replace(/\s+/g, ' ') === 
                              track.title.trim().toLowerCase().replace(/\s+/g, ' ');
            return timeMatch && titleMatch;
          })
        );
        console.log(`[YouTube Download] Job ${jobId}: Usando ${tracksToSplit.length} tracce selezionate su ${albumInfo.tracks.length} totali`);
        
        // Se nessuna traccia corrisponde, usa direttamente selectedTracks (potrebbero essere da parsing manuale)
        if (tracksToSplit.length === 0) {
          console.log(`[YouTube Download] Job ${jobId}: Nessuna corrispondenza con tracce rilevate, uso tracce selezionate direttamente`);
          tracksToSplit = selectedTracks.map(st => ({
            startTime: st.startTime,
            endTime: st.endTime || null,
            title: st.title,
          }));
        }
      }
    } else if (selectedTracks && selectedTracks.length > 0) {
      // Non è album automatico ma ci sono tracce selezionate manualmente (parsing manuale)
      // Usa direttamente le tracce selezionate e calcola endTime se mancante
      const duration = videoInfo?.duration || metadata.duration || 0;
      tracksToSplit = selectedTracks.map((st, index) => {
        let endTime = st.endTime;
        if (!endTime || endTime === null) {
          // Se non c'è endTime, usa quello della traccia successiva o la durata totale
          const nextTrack = selectedTracks[index + 1];
          endTime = nextTrack ? nextTrack.startTime : (duration || null);
        }
        return {
          startTime: st.startTime,
          endTime: endTime,
          title: st.title,
        };
      });
      console.log(`[YouTube Download] Job ${jobId}: Usando ${tracksToSplit.length} tracce selezionate manualmente (parsing manuale)`);
      console.log(`[YouTube Download] Job ${jobId}: Durata video: ${duration}s`);
      console.log(`[YouTube Download] Job ${jobId}: Tracce con endTime:`, tracksToSplit.map(t => `${t.startTime}s-${t.endTime || 'null'}s: ${t.title}`).join(', '));
    }
    
    if (tracksToSplit && tracksToSplit.length > 0) {
      console.log(`[YouTube Download] Job ${jobId}: Divisione in ${tracksToSplit.length} tracce...`);
      console.log(`[YouTube Download] Job ${jobId}: Tracce da dividere:`, tracksToSplit.map(t => `${t.startTime}s - ${t.title}`).join(', '));
      downloadQueue.updateJob(jobId, { 
        progress: 92,
        statusMessage: `Divisione album in ${tracksToSplit.length} tracce...`
      });
      
      const splitDir = path.join(tempDir, `split-${jobId}`);
      await ensureDirectoryExists(splitDir);
      
      // Dividi il file audio
      const splitTracks = await splitAudioFile(
        filePath,
        tracksToSplit,
        splitDir,
        (progress) => {
          const totalProgress = 92 + (progress.current / tracksToSplit.length) * 5;
          downloadQueue.updateJob(jobId, { 
            progress: Math.min(totalProgress, 97),
            statusMessage: `Ricerca metadati traccia ${progress.current}/${tracksToSplit.length}...`,
            splittingTrack: progress.track,
          });
        }
      );
      
      console.log(`[YouTube Download] Job ${jobId}: Album diviso in ${splitTracks.length} tracce`);
      
      // Download thumbnail una volta per tutte le tracce
      let coverArtPath = null;
      if (thumbnailUrl) {
        console.log(`[YouTube Download] Job ${jobId}: Download thumbnail da URL...`);
        coverArtPath = await downloadThumbnail(thumbnailUrl, userId, metadata.album || 'Album', storagePath);
      }
      
      if (!coverArtPath && metadata.picture) {
        console.log(`[YouTube Download] Job ${jobId}: Salvataggio cover art dal file...`);
        coverArtPath = await saveCoverArt(
          metadata.picture,
          userId,
          metadata.album,
          storagePath
        );
      }
      
      // Per ogni traccia divisa: cerca metadati e salva nel database
      downloadQueue.updateJob(jobId, { 
        progress: 97,
        statusMessage: 'Salvataggio tracce nel database...'
      });
      
      const savedTracks = [];
      const albumArtist = metadata.artist || videoInfo?.uploader || 'Unknown Artist';
      const albumName = metadata.album || videoInfo?.title || 'Unknown Album';
      
      for (let i = 0; i < splitTracks.length; i++) {
        const splitTrack = splitTracks[i];
        const trackTitle = splitTrack.title;
        
        console.log(`[YouTube Download] Job ${jobId}: Elaborazione traccia ${i + 1}/${splitTracks.length}: ${trackTitle}`);
        
        // Cerca metadati per questa traccia
        let trackMetadata = await searchTrackMetadata(albumArtist, trackTitle, albumName);
        
        // Estrai metadati dal file diviso
        const fileMetadata = await extractMetadata(splitTrack.path);
        
        // Combina metadati (preferisci quelli cercati, fallback a file)
        const finalMetadata = {
          title: trackMetadata?.title || trackTitle || fileMetadata.title,
          artist: trackMetadata?.artist || albumArtist || fileMetadata.artist,
          album: trackMetadata?.album || albumName || fileMetadata.album,
          albumArtist: albumArtist,
          genre: trackMetadata?.genre || metadata.genre || fileMetadata.genre,
          year: trackMetadata?.year || metadata.year || fileMetadata.year,
          trackNumber: trackMetadata?.trackNumber || (i + 1),
          discNumber: metadata.discNumber || fileMetadata.discNumber,
          duration: Math.round((splitTrack.endTime || 0) - (splitTrack.startTime || 0)),
          bitrate: fileMetadata.bitrate,
          sampleRate: fileMetadata.sampleRate,
        };
        
        // Determina percorso finale per questa traccia
        const finalPath = getTrackStoragePath(userId, finalMetadata.artist, finalMetadata.album);
        await ensureDirectoryExists(finalPath);
        
        // Sposta file
        const finalFilePath = path.join(finalPath, path.basename(splitTrack.path));
        const relativeFilePath = path.relative(storagePath, finalFilePath);

        // Verifica duplicati prima di spostare il file
        const isDuplicate = await isDuplicateFile(userId, relativeFilePath);
        if (isDuplicate) {
          console.warn(`[YouTube Download] File duplicato ignorato: ${relativeFilePath}`);
          // Rimuovi il file temporaneo
          try {
            await fs.unlink(splitTrack.path);
          } catch (unlinkError) {
            // Ignora errori di cleanup
          }
          // Continua con la prossima traccia senza bloccare
          continue;
        }

        await fs.rename(splitTrack.path, finalFilePath);
        
        // Statistiche file
        const stats = await getFileStats(finalFilePath);
        
        // Inserisci nel database
        const result = await pool.query(
          `INSERT INTO tracks (
            user_id, title, artist, album, album_artist, genre, year,
            track_number, disc_number, duration, file_path, file_size,
            file_format, bitrate, sample_rate, cover_art_path
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING id, title, artist, album, duration, file_size, created_at`,
          [
            userId,
            finalMetadata.title,
            finalMetadata.artist,
            finalMetadata.album,
            finalMetadata.albumArtist,
            finalMetadata.genre,
            finalMetadata.year,
            finalMetadata.trackNumber,
            finalMetadata.discNumber,
            finalMetadata.duration,
            path.relative(storagePath, finalFilePath),
            stats?.size || 0,
            path.extname(finalFilePath).substring(1).toLowerCase(),
            finalMetadata.bitrate ? Math.round(finalMetadata.bitrate) : null,
            finalMetadata.sampleRate ? Math.round(finalMetadata.sampleRate) : null,
            coverArtPath,
          ]
        );
        
        savedTracks.push(result.rows[0]);
        
        // Trigger processing metadati in background (non bloccante)
        processTrack(result.rows[0].id).catch(error => {
          console.error(`[YouTube Download] Errore processing metadati per traccia ${result.rows[0].id}:`, error.message);
        });
      }
      
      // Rimuovi file originale e directory split
      try {
        await fs.unlink(filePath);
        await fs.rmdir(splitDir);
      } catch (cleanupError) {
        console.warn(`[YouTube Download] Job ${jobId}: Errore pulizia file temporanei: ${cleanupError.message}`);
      }
      
      // Aggiungi tracce alla playlist se specificata
      if (finalPlaylistId && savedTracks.length > 0) {
        console.log(`[YouTube Download] Job ${jobId}: Aggiunta ${savedTracks.length} tracce alla playlist ${finalPlaylistId}...`);
        downloadQueue.updateJob(jobId, { 
          progress: 99,
          statusMessage: `Aggiunta tracce alla playlist...`
        });
        
        await addTracksToPlaylist(userId, finalPlaylistId, savedTracks.map(t => t.id));
      }
      
      console.log(`[YouTube Download] Job ${jobId}: Album diviso e salvato. ${savedTracks.length} tracce create`);
      
      downloadQueue.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        statusMessage: 'Completato!',
        track: savedTracks[0], // Ritorna la prima traccia come riferimento
        tracks: savedTracks, // Tutte le tracce create
      });
      
      downloadQueue.jobFinished(userId, jobId);
    } else {
      // Comportamento normale: singola traccia
      // Determina percorso finale
      const finalPath = getTrackStoragePath(userId, metadata.artist, metadata.album);
      await ensureDirectoryExists(finalPath);

      // Sposta file
      const finalFilePath = path.join(finalPath, path.basename(filePath));
      const relativeFilePath = path.relative(storagePath, finalFilePath);

      // Verifica duplicati prima di spostare il file
      const isDuplicate = await isDuplicateFile(userId, relativeFilePath);
      if (isDuplicate) {
        console.warn(`[YouTube Download] File duplicato ignorato: ${relativeFilePath}`);
        // Rimuovi il file temporaneo
        try {
          await fs.unlink(filePath);
        } catch (unlinkError) {
          // Ignora errori di cleanup
        }
        // Lancia errore per gestirlo nel catch esterno
        throw new Error(`File duplicato: ${relativeFilePath}`);
      }

      await fs.rename(filePath, finalFilePath);

      // Statistiche file
      const stats = await getFileStats(finalFilePath);

      // Download thumbnail se fornita, altrimenti usa cover art dal file
      let coverArtPath = null;
      if (thumbnailUrl) {
        console.log(`[YouTube Download] Job ${jobId}: Download thumbnail da URL...`);
        coverArtPath = await downloadThumbnail(thumbnailUrl, userId, metadata.title, storagePath);
      }
      
      if (!coverArtPath && metadata.picture) {
        console.log(`[YouTube Download] Job ${jobId}: Salvataggio cover art dal file...`);
        coverArtPath = await saveCoverArt(
          metadata.picture,
          userId,
          metadata.album,
          storagePath
        );
      }

      // Inserisci nel database
      console.log(`[YouTube Download] Job ${jobId}: Inserimento nel database...`);
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
          Math.round(metadata.duration || 0),
          path.relative(storagePath, finalFilePath),
          stats?.size || 0,
          path.extname(finalFilePath).substring(1).toLowerCase(),
          metadata.bitrate ? Math.round(metadata.bitrate) : null,
          metadata.sampleRate ? Math.round(metadata.sampleRate) : null,
          coverArtPath,
        ]
      );

      console.log(`[YouTube Download] Job ${jobId}: Completato con successo. Track ID: ${result.rows[0].id}`);
      
      downloadQueue.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        statusMessage: 'Completato!',
        track: result.rows[0],
      });

      downloadQueue.jobFinished(userId, jobId);
      
      // Trigger processing metadati in background (non bloccante)
      processTrack(result.rows[0].id).catch(error => {
        console.error(`[YouTube Download] Errore processing metadati per traccia ${result.rows[0].id}:`, error.message);
      });
    }
  } catch (error) {
    console.error(`[YouTube Download] Job ${jobId}: Errore:`, error.message);
    downloadQueue.updateJob(jobId, {
      status: 'failed',
      error: error.message,
      statusMessage: `Errore: ${error.message}`,
    });
    downloadQueue.jobFinished(userId, jobId);
  }
}

/**
 * Helper function per aggiungere multiple tracce a una playlist
 */
export async function addTracksToPlaylist(userId, playlistId, trackIds) {
  // Verifica che la playlist appartenga all'utente
  const playlistCheck = await pool.query(
    'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
    [playlistId, userId]
  );
  
  if (playlistCheck.rows.length === 0) {
    throw new Error('Playlist non trovata o non autorizzata');
  }
  
  // Ottieni la posizione massima attuale
  const maxResult = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM playlist_tracks WHERE playlist_id = $1',
    [playlistId]
  );
  let position = parseInt(maxResult.rows[0].next_position);
  
  // Aggiungi ogni traccia alla playlist
  for (const trackId of trackIds) {
    // Verifica che la traccia non sia già nella playlist
    const existingCheck = await pool.query(
      'SELECT id FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2',
      [playlistId, trackId]
    );
    
    if (existingCheck.rows.length === 0) {
      await pool.query(
        'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3)',
        [playlistId, trackId, position]
      );
      position++;
    }
  }
}

// Helper function per ottenere il percorso di yt-dlp
const getYtdlpPath = async () => {
  let ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
  
  if (ytdlpPath.startsWith('/')) {
    try {
      await fs.access(ytdlpPath);
      return ytdlpPath;
    } catch (error) {
      console.error(`[YouTube Search] yt-dlp non trovato al percorso: ${ytdlpPath}`);
      try {
        const { stdout } = await execAsync('which yt-dlp', { maxBuffer: 1024 });
        return stdout.trim();
      } catch (pathError) {
        throw new AppError('yt-dlp non è installato o non è nel PATH. Verifica l\'installazione.', 500);
      }
    }
  } else {
    try {
      const { stdout } = await execAsync(`which ${ytdlpPath}`, { maxBuffer: 1024 });
      return stdout.trim();
    } catch (error) {
      console.error(`[YouTube Search] yt-dlp non trovato nel PATH: ${ytdlpPath}`);
      throw new AppError('yt-dlp non è installato o non è nel PATH. Verifica l\'installazione.', 500);
    }
  }
};

export const getQueue = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const jobs = downloadQueue.getUserJobs(userId);
    
    res.json({
      success: true,
      data: {
        jobs: jobs.map(job => ({
          id: job.id,
          url: job.url,
          status: job.status,
          progress: job.progress,
          speed: job.speed,
          eta: job.eta,
          error: job.error,
          track: job.track,
          statusMessage: job.statusMessage || null,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const cancelJob = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const job = downloadQueue.getJob(jobId);
    if (!job) {
      return next(new AppError('Job non trovato', 404));
    }

    if (job.userId !== userId) {
      return next(new AppError('Non autorizzato', 403));
    }

    // Non permettere cancellazione di job completed (vengono rimossi automaticamente)
    if (job.status === 'completed') {
      return next(new AppError('Job già completato', 400));
    }

    // Se è downloading, emetti evento per fermare il processo
    if (job.status === 'downloading') {
      downloadQueue.emit('job-cancel-requested', job);
    }

    downloadQueue.removeJob(jobId);

    // Se era in processing, riavvia la coda
    downloadQueue.jobFinished(userId, jobId);

    res.json({
      success: true,
      data: {
        message: 'Job cancellato con successo',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const pauseJob = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const job = downloadQueue.getJob(jobId);
    if (!job) {
      return next(new AppError('Job non trovato', 404));
    }

    if (job.userId !== userId) {
      return next(new AppError('Non autorizzato', 403));
    }

    // Solo job pending possono essere messi in pausa
    if (job.status !== 'pending') {
      return next(new AppError('Solo i job in attesa possono essere messi in pausa', 400));
    }

    const success = downloadQueue.pauseJob(jobId);
    if (!success) {
      return next(new AppError('Impossibile mettere in pausa questo job', 400));
    }

    res.json({
      success: true,
      data: {
        message: 'Job messo in pausa',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const resumeJob = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const job = downloadQueue.getJob(jobId);
    if (!job) {
      return next(new AppError('Job non trovato', 404));
    }

    if (job.userId !== userId) {
      return next(new AppError('Non autorizzato', 403));
    }

    const success = downloadQueue.resumeJob(jobId);
    if (!success) {
      return next(new AppError('Impossibile riprendere questo job', 400));
    }

    res.json({
      success: true,
      data: {
        message: 'Job ripreso',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const searchYouTube = async (req, res, next) => {
  // #region agent log
  const debugLog = (data) => {
    console.log('[DEBUG-YT]', JSON.stringify({...data, timestamp: Date.now()}));
  };
  // #endregion

  try {
    const validatedData = searchSchema.parse(req.query);
    const { q: query, limit, albumOnly } = validatedData;
    const maxResults = parseInt(limit, 10);
    const filterAlbumsOnly = albumOnly === 'true';

    // #region agent log
    debugLog({location:'youtubeController.js:827',message:'searchYouTube entry',data:{query,limit,albumOnly,maxResults,filterAlbumsOnly},sessionId:'debug-session',runId:'search-debug',hypothesisId:'H1,H2,H3,H4,H5'});
    // #endregion

    console.log(`[YouTube Search] Ricerca: "${query}", Limite: ${maxResults}`);

    const ytdlpPath = await getYtdlpPath();
    console.log(`[YouTube Search] yt-dlp path: ${ytdlpPath}`);

    // Ottieni cookies attivi se disponibili
    const cookiesPath = await getActiveCookiesPath();
    const cookiesFlag = cookiesPath ? `--cookies "${cookiesPath}"` : '';
    
    // #region agent log
    let cookiesExist = false;
    let cookiesSize = 0;
    if (cookiesPath) {
      try {
        const cookiesStats = await fs.stat(cookiesPath);
        cookiesExist = true;
        cookiesSize = cookiesStats.size;
      } catch (e) {
        cookiesExist = false;
      }
    }
    debugLog({location:'youtubeController.js:840',message:'cookies check',data:{cookiesPath,cookiesFlag,cookiesExist,cookiesSize},sessionId:'debug-session',runId:'search-debug',hypothesisId:'H1'});
    // #endregion
    
    if (cookiesPath) {
      console.log(`[YouTube Search] Usando cookies da: ${cookiesPath}`);
    } else {
      console.log(`[YouTube Search] Nessun cookies attivo trovato`);
    }
    
    // Usa ytsearch per cercare senza scaricare
    // IMPORTANTE: --flat-playlist restituisce solo metadati base (MOLTO più veloce)
    // senza estrarre tutti i formati disponibili per ogni video
    const searchQuery = `ytsearch${maxResults}:${query}`;
    const extraArgs = '--no-warnings --flat-playlist';
    const command = `${ytdlpPath} "${searchQuery}" --dump-json ${extraArgs} ${cookiesFlag}`.trim();

    // Timeout ridotti grazie a --flat-playlist che è molto più veloce
    let timeoutMs = 30000; // 30s per 5-10 risultati
    let maxBufferSize = 5 * 1024 * 1024; // 5MB default (output ridotto)
    
    if (maxResults === 20) {
      timeoutMs = 45000; // 45s per 20 risultati
      maxBufferSize = 10 * 1024 * 1024; // 10MB per più risultati
    } else if (maxResults === 50) {
      timeoutMs = 90000; // 90s per 50 risultati
      maxBufferSize = 20 * 1024 * 1024; // 20MB per molti risultati
    }
    
    // #region agent log
    debugLog({location:'youtubeController.js:866',message:'command before exec',data:{command,searchQuery,timeoutMs,maxBufferSize},sessionId:'debug-session',runId:'search-debug',hypothesisId:'H4,H5'});
    // #endregion
    
    console.log(`[YouTube Search] Esecuzione comando yt-dlp... (timeout: ${timeoutMs}ms, buffer: ${maxBufferSize / 1024 / 1024}MB)`);
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: maxBufferSize,
        timeout: timeoutMs
      });

      const duration = Date.now() - startTime;
      console.log(`[YouTube Search] Comando completato in ${duration}ms`);

      // #region agent log
      debugLog({location:'youtubeController.js:875',message:'command completed',data:{duration,stdoutLength:stdout?.length||0,stderrLength:stderr?.length||0,stderrPreview:stderr?.substring(0,300),stdoutPreview:stdout?.substring(0,500)},sessionId:'debug-session',runId:'search-debug',hypothesisId:'H2,H3,H4'});
      // #endregion

      if (stderr && !stderr.includes('WARNING')) {
        console.log(`[YouTube Search] stderr: ${stderr.substring(0, 500)}`);
      }

      // Parse JSON results - yt-dlp restituisce un JSON per riga
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const results = [];
      
      // #region agent log
      debugLog({location:'youtubeController.js:883',message:'before parsing lines',data:{totalLines:lines.length,firstLinePreview:lines[0]?.substring(0,200)},sessionId:'debug-session',runId:'search-debug',hypothesisId:'H3'});
      // #endregion

      // #region agent log
      let parseErrors = 0;
      let parseSuccess = 0;
      // #endregion

      for (const line of lines) {
        try {
          const videoData = JSON.parse(line);
          // #region agent log
          parseSuccess++;
          // #endregion
          
          const duration = videoData.duration || 0;
          
          // Con --flat-playlist, description non è disponibile.
          // Mostriamo "Possibile Album" per video > 20 minuti.
          // L'album detection completa avviene al momento del download.
          const MIN_ALBUM_DURATION = 20 * 60; // 20 minuti in secondi
          const isPossibleAlbum = duration >= MIN_ALBUM_DURATION;
          
          // Nessun timestamp disponibile dalla ricerca (saranno rilevati al download)
          let timestamps = [];
          
          // Estrai thumbnail con fallback multipli
          let thumbnailUrl = null;
          if (videoData.thumbnail) {
            thumbnailUrl = videoData.thumbnail;
          } else if (videoData.thumbnails && Array.isArray(videoData.thumbnails) && videoData.thumbnails.length > 0) {
            // Prova prima la thumbnail più grande disponibile
            const sortedThumbnails = videoData.thumbnails
              .filter(t => t.url)
              .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
            thumbnailUrl = sortedThumbnails[0]?.url || null;
          } else if (videoData.id) {
            // Fallback: usa thumbnail standard YouTube se disponibile
            thumbnailUrl = `https://img.youtube.com/vi/${videoData.id}/maxresdefault.jpg`;
          }
          
          if (!thumbnailUrl && videoData.id) {
            console.warn(`[YouTube Search] Thumbnail non trovata per video ${videoData.id}, usando fallback`);
            thumbnailUrl = `https://img.youtube.com/vi/${videoData.id}/hqdefault.jpg`;
          }
          
          // Estrai informazioni essenziali
          const result = {
            id: videoData.id || null,
            title: videoData.title || 'Senza titolo',
            channel: videoData.channel || videoData.uploader || 'Canale sconosciuto',
            duration: duration,
            thumbnail_url: thumbnailUrl,
            description: '', // Non disponibile con --flat-playlist
            full_description: '', // Sarà ottenuta al momento del download
            view_count: videoData.view_count || 0,
            url: videoData.webpage_url || `https://www.youtube.com/watch?v=${videoData.id}`,
            isAlbum: isPossibleAlbum, // Basato sulla durata (>20min), conferma al download
            timestamps: timestamps, // Vuoto, saranno rilevati al download
          };

          results.push(result);
        } catch (parseError) {
          console.error(`[YouTube Search] Errore parsing JSON:`, parseError.message);
          // #region agent log
          parseErrors++;
          debugLog({location:'youtubeController.js:970',message:'JSON parse error',data:{error:parseError.message,linePreview:line?.substring(0,200)},sessionId:'debug-session',runId:'search-debug',hypothesisId:'H3'});
          // #endregion
          // Continua con il prossimo risultato
        }
      }

      // #region agent log
      debugLog({location:'youtubeController.js:975',message:'parsing summary',data:{parseSuccess,parseErrors,totalResults:results.length},sessionId:'debug-session',runId:'search-debug',hypothesisId:'H3'});
      // #endregion

      // Filtra per durata > 20 minuti se albumOnly è attivo
      let filteredResults = results;
      if (filterAlbumsOnly) {
        const minDurationSeconds = 20 * 60; // 20 minuti = 1200 secondi
        filteredResults = results.filter(result => result.duration >= minDurationSeconds);
        console.log(`[YouTube Search] Filtro album attivo: ${results.length} risultati totali, ${filteredResults.length} con durata >= 20 minuti`);
      }

      console.log(`[YouTube Search] Trovati ${filteredResults.length} risultati${filterAlbumsOnly ? ' (filtrati per album)' : ''}`);

      // #region agent log
      debugLog({location:'youtubeController.js:991',message:'search success before response',data:{filteredCount:filteredResults.length,totalCount:results.length,query},sessionId:'debug-session',runId:'search-debug',hypothesisId:'H1,H2,H3,H4,H5'});
      // #endregion

      res.json({
        success: true,
        data: {
          results: filteredResults,
          count: filteredResults.length,
          query,
          albumOnly: filterAlbumsOnly,
        },
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[YouTube Search] Errore dopo ${duration}ms:`, error.message);
      console.error(`[YouTube Search] stdout:`, error.stdout?.substring(0, 500));
      console.error(`[YouTube Search] stderr:`, error.stderr?.substring(0, 500));
      
      // #region agent log
      debugLog({location:'youtubeController.js:1010',message:'search FAILED',data:{error:error.message,errorCode:error.code,duration,stdoutPreview:error.stdout?.substring(0,500),stderrPreview:error.stderr?.substring(0,500),query},sessionId:'debug-session',runId:'search-debug',hypothesisId:'H1,H2,H3,H4,H5'});
      // #endregion
      
      const errorMessage = error.stderr?.includes('ERROR')
        ? error.stderr.split('ERROR')[1]?.substring(0, 200) || error.message
        : error.message;
      
      throw new AppError('Errore durante la ricerca su YouTube: ' + errorMessage, 500);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

const splitSchema = z.object({
  timestamps: z.array(z.object({
    startTime: z.number().min(0),
    endTime: z.number().min(0).nullable(),
    title: z.string().min(1),
  })).min(1, 'Almeno un timestamp richiesto'),
  useYouTubeDescription: z.boolean().optional().default(false),
});

const parseTimestampsSchema = z.object({
  url: z.string().url('URL non valido'),
});

export const splitTrack = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { trackId } = req.params;
    
    // Verifica che la traccia esista e appartenga all'utente
    const trackResult = await pool.query(
      `SELECT t.*, u.id as user_id 
       FROM tracks t 
       JOIN users u ON t.user_id = u.id 
       WHERE t.id = $1`,
      [trackId]
    );
    
    if (trackResult.rows.length === 0) {
      return next(new AppError('Traccia non trovata', 404));
    }
    
    const track = trackResult.rows[0];
    
    // Verifica che la traccia sia abbastanza lunga (>30 minuti) o che l'utente sia il proprietario
    if (track.duration < 1800 && track.user_id !== userId) {
      return next(new AppError('Non autorizzato a dividere questa traccia', 403));
    }
    
    const validatedData = splitSchema.parse(req.body);
    const { timestamps, useYouTubeDescription } = validatedData;
    
    const storagePath = getStoragePath();
    const filePath = path.join(storagePath, track.file_path);
    
    // Verifica che il file esista
    try {
      await fs.access(filePath);
    } catch (error) {
      return next(new AppError('File audio non trovato', 404));
    }
    
    // Se useYouTubeDescription è true, prova a ottenere la descrizione da YouTube
    let tracksToSplit = timestamps;
    if (useYouTubeDescription && track.file_path) {
      // Cerca URL YouTube originale nel database o nei metadati
      // Per ora usiamo i timestamp forniti
      console.log(`[Split Track] Usando timestamp forniti dall'utente`);
    }
    
    // Crea directory temporanea per le tracce divise
    const splitDir = path.join(storagePath, 'temp', 'split', trackId.toString());
    await ensureDirectoryExists(splitDir);
    
    // Dividi il file audio
    console.log(`[Split Track] Divisione traccia ${trackId} in ${tracksToSplit.length} tracce...`);
    const splitTracks = await splitAudioFile(
      filePath,
      tracksToSplit,
      splitDir,
      null // Nessun callback di progresso per divisione manuale
    );
    
    // Estrai metadati originali
    const originalMetadata = await extractMetadata(filePath);
    const albumArtist = track.album_artist || track.artist || 'Unknown Artist';
    const albumName = track.album || 'Unknown Album';
    
    // Per ogni traccia divisa: cerca metadati e salva nel database
    const savedTracks = [];
    
    for (let i = 0; i < splitTracks.length; i++) {
      const splitTrack = splitTracks[i];
      const trackTitle = splitTrack.title;
      
      console.log(`[Split Track] Elaborazione traccia ${i + 1}/${splitTracks.length}: ${trackTitle}`);
      
      // Cerca metadati per questa traccia
      let trackMetadata = await searchTrackMetadata(albumArtist, trackTitle, albumName);
      
      // Estrai metadati dal file diviso
      const fileMetadata = await extractMetadata(splitTrack.path);
      
      // Combina metadati
      const finalMetadata = {
        title: trackMetadata?.title || trackTitle || fileMetadata.title,
        artist: trackMetadata?.artist || albumArtist || fileMetadata.artist,
        album: trackMetadata?.album || albumName || fileMetadata.album,
        albumArtist: albumArtist,
        genre: trackMetadata?.genre || track.genre || fileMetadata.genre,
        year: trackMetadata?.year || null,
        trackNumber: trackMetadata?.trackNumber || (i + 1),
        discNumber: null,
        duration: Math.round((splitTrack.endTime || 0) - (splitTrack.startTime || 0)),
        bitrate: fileMetadata.bitrate,
        sampleRate: fileMetadata.sampleRate,
      };
      
      // Determina percorso finale per questa traccia
      const finalPath = getTrackStoragePath(userId, finalMetadata.artist, finalMetadata.album);
      await ensureDirectoryExists(finalPath);
      
      // Sposta file
      const finalFilePath = path.join(finalPath, path.basename(splitTrack.path));
      const relativeFilePath = path.relative(storagePath, finalFilePath);

      // Verifica duplicati prima di spostare il file
      const isDuplicate = await isDuplicateFile(userId, relativeFilePath);
      if (isDuplicate) {
        console.warn(`[Split Track] File duplicato ignorato: ${relativeFilePath}`);
        // Rimuovi il file temporaneo
        try {
          await fs.unlink(splitTrack.path);
        } catch (unlinkError) {
          // Ignora errori di cleanup
        }
        // Continua con la prossima traccia senza bloccare
        continue;
      }

      await fs.rename(splitTrack.path, finalFilePath);
      
      // Statistiche file
      const stats = await getFileStats(finalFilePath);
      
      // Inserisci nel database
      const result = await pool.query(
        `INSERT INTO tracks (
          user_id, title, artist, album, album_artist, genre, year,
          track_number, disc_number, duration, file_path, file_size,
          file_format, bitrate, sample_rate, cover_art_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id, title, artist, album, duration, file_size, created_at`,
        [
          userId,
          finalMetadata.title,
          finalMetadata.artist,
          finalMetadata.album,
          finalMetadata.albumArtist,
          finalMetadata.genre,
          finalMetadata.year,
          finalMetadata.trackNumber,
          finalMetadata.discNumber,
          finalMetadata.duration,
          path.relative(storagePath, finalFilePath),
          stats?.size || 0,
          path.extname(finalFilePath).substring(1).toLowerCase(),
          finalMetadata.bitrate ? Math.round(finalMetadata.bitrate) : null,
          finalMetadata.sampleRate ? Math.round(finalMetadata.sampleRate) : null,
          track.cover_art_path, // Usa la stessa cover art della traccia originale
        ]
      );
      
      savedTracks.push(result.rows[0]);
    }
    
    // Rimuovi directory split temporanea
    try {
      await fs.rmdir(splitDir);
    } catch (cleanupError) {
      console.warn(`[Split Track] Errore pulizia directory temporanea: ${cleanupError.message}`);
    }
    
    // Opzionalmente, elimina la traccia originale (commentato per sicurezza)
    // await pool.query('DELETE FROM tracks WHERE id = $1', [trackId]);
    // await fs.unlink(filePath);
    
    console.log(`[Split Track] Traccia ${trackId} divisa in ${savedTracks.length} tracce`);
    
    res.json({
      success: true,
      data: {
        message: `Traccia divisa in ${savedTracks.length} tracce`,
        tracks: savedTracks,
        originalTrackId: trackId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

/**
 * Parsa timestamp dalla descrizione di un video YouTube
 */
export const parseTimestampsFromVideo = async (req, res, next) => {
  try {
    const validatedData = parseTimestampsSchema.parse(req.body);
    const { url } = validatedData;

    console.log(`[Parse Timestamps] Parsing timestamp per URL: ${url}`);

    const ytdlpPath = await getYtdlpPath();
    
    // Ottieni informazioni video con descrizione completa
            // Ottieni cookies attivi se disponibili
            const cookiesPath = await getActiveCookiesPath();
            const cookiesFlag = cookiesPath ? `--cookies "${cookiesPath}"` : '';
            const extraArgs = '--no-warnings --no-check-formats --extractor-args "youtube:player_client=default"';
            const command = `${ytdlpPath} "${url}" --dump-json --no-playlist ${extraArgs} ${cookiesFlag}`.trim();
    
    try {
      const { stdout } = await execAsync(command, {
        maxBuffer: 20 * 1024 * 1024, // 20MB
        timeout: 90000 // 90 secondi (aumentato da 30s)
      });

      const videoData = JSON.parse(stdout.trim());
      const description = videoData.description || '';
      const duration = videoData.duration || 0;

      // Parsa timestamp dalla descrizione
      const tracks = parseTimestampsFromDescription(description, duration);

      if (tracks.length === 0) {
        return res.json({
          success: true,
          data: {
            tracks: [],
            message: 'Nessun timestamp trovato nella descrizione',
          },
        });
      }

      console.log(`[Parse Timestamps] Trovati ${tracks.length} timestamp`);

      res.json({
        success: true,
        data: {
          tracks: tracks.map(t => ({
            startTime: t.startTime,
            endTime: t.endTime,
            title: t.title,
          })),
          count: tracks.length,
        },
      });
    } catch (error) {
      console.error(`[Parse Timestamps] Errore:`, error.message);
      const errorMessage = error.stderr?.includes('ERROR')
        ? error.stderr.split('ERROR')[1]?.substring(0, 200) || error.message
        : error.message;
      
      throw new AppError('Errore durante il parsing dei timestamp: ' + errorMessage, 500);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};


import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { extractMetadata, saveCoverArt, downloadThumbnail } from '../utils/audioMetadata.js';
import { getTrackStoragePath, ensureDirectoryExists, getStoragePath, getFileStats } from '../utils/storage.js';
import downloadQueue from '../utils/downloadQueue.js';
import { detectAlbum } from '../utils/albumDetector.js';
import { parseTimestampsFromDescription } from '../utils/timestampParser.js';
import { splitAudioFile } from '../utils/audioSplitter.js';
import { searchTrackMetadata } from '../utils/metadataSearch.js';
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
      const infoCommand = `${ytdlpPath} "${url}" --dump-json --no-playlist`;
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

    // Se è un album, dividilo in tracce
    if (albumInfo && albumInfo.isAlbum && albumInfo.tracks.length > 0) {
      // Usa tracce selezionate se fornite, altrimenti usa tutte quelle rilevate
      let tracksToSplit = albumInfo.tracks;
      if (selectedTracks && selectedTracks.length > 0) {
        // Filtra le tracce rilevate per includere solo quelle selezionate
        tracksToSplit = albumInfo.tracks.filter(track => 
          selectedTracks.some(st => 
            Math.abs(st.startTime - track.startTime) < 1 && st.title === track.title
          )
        );
        console.log(`[YouTube Download] Job ${jobId}: Usando ${tracksToSplit.length} tracce selezionate su ${albumInfo.tracks.length} totali`);
      }
      
      if (tracksToSplit.length === 0) {
        throw new Error('Nessuna traccia selezionata per la divisione');
      }
      
      console.log(`[YouTube Download] Job ${jobId}: Divisione album in ${tracksToSplit.length} tracce...`);
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
async function addTracksToPlaylist(userId, playlistId, trackIds) {
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
  try {
    const validatedData = searchSchema.parse(req.query);
    const { q: query, limit } = validatedData;
    const maxResults = parseInt(limit, 10);

    console.log(`[YouTube Search] Ricerca: "${query}", Limite: ${maxResults}`);

    const ytdlpPath = await getYtdlpPath();
    console.log(`[YouTube Search] yt-dlp path: ${ytdlpPath}`);

    // Usa ytsearch per cercare senza scaricare
    const searchQuery = `ytsearch${maxResults}:${query}`;
    const command = `${ytdlpPath} "${searchQuery}" --dump-json --no-playlist`;

    console.log(`[YouTube Search] Esecuzione comando yt-dlp...`);
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 5 * 1024 * 1024, // 5MB per i risultati JSON
        timeout: 30000 // 30 secondi timeout
      });

      const duration = Date.now() - startTime;
      console.log(`[YouTube Search] Comando completato in ${duration}ms`);

      if (stderr && !stderr.includes('WARNING')) {
        console.log(`[YouTube Search] stderr: ${stderr.substring(0, 500)}`);
      }

      // Parse JSON results - yt-dlp restituisce un JSON per riga
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const results = [];

      for (const line of lines) {
        try {
          const videoData = JSON.parse(line);
          
          // Estrai descrizione completa (non solo primi 200 caratteri)
          const fullDescription = videoData.description || '';
          const duration = videoData.duration || 0;
          
          // Rileva se è un album e estrai timestamp
          const albumInfo = detectAlbum(duration, fullDescription);
          const timestamps = albumInfo.tracks.length > 0 
            ? albumInfo.tracks.map(t => ({
                startTime: t.startTime,
                endTime: t.endTime,
                title: t.title,
              }))
            : [];
          
          // Estrai informazioni essenziali
          const result = {
            id: videoData.id || null,
            title: videoData.title || 'Senza titolo',
            channel: videoData.channel || videoData.uploader || 'Canale sconosciuto',
            duration: duration,
            thumbnail_url: videoData.thumbnail || videoData.thumbnails?.[0]?.url || null,
            description: fullDescription.substring(0, 500), // Mostra primi 500 caratteri per preview
            full_description: fullDescription, // Descrizione completa per parsing
            view_count: videoData.view_count || 0,
            url: videoData.webpage_url || `https://www.youtube.com/watch?v=${videoData.id}`,
            isAlbum: albumInfo.isAlbum,
            timestamps: timestamps,
          };

          results.push(result);
        } catch (parseError) {
          console.error(`[YouTube Search] Errore parsing JSON:`, parseError.message);
          // Continua con il prossimo risultato
        }
      }

      console.log(`[YouTube Search] Trovati ${results.length} risultati`);

      res.json({
        success: true,
        data: {
          results,
          count: results.length,
          query,
        },
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[YouTube Search] Errore dopo ${duration}ms:`, error.message);
      console.error(`[YouTube Search] stdout:`, error.stdout?.substring(0, 500));
      console.error(`[YouTube Search] stderr:`, error.stderr?.substring(0, 500));
      
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


import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { extractMetadata, saveCoverArt, downloadThumbnail } from '../utils/audioMetadata.js';
import { getTrackStoragePath, ensureDirectoryExists, getStoragePath, getFileStats } from '../utils/storage.js';
import downloadQueue from '../utils/downloadQueue.js';
import { z } from 'zod';

const execAsync = promisify(exec);

const downloadSchema = z.object({
  url: z.string().url('URL non valido'),
  thumbnailUrl: z.string().url().optional().nullable(),
});

const searchSchema = z.object({
  q: z.string().min(1, 'Query di ricerca non può essere vuota'),
  limit: z.enum(['5', '10', '20', '50']).default('10'),
});

export const downloadYouTube = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const validatedData = downloadSchema.parse(req.body);
    const { url, thumbnailUrl } = validatedData;

    console.log(`[YouTube Download] Aggiunta job alla coda per URL: ${url}, User ID: ${userId}`);

    // Aggiungi il job alla coda invece di eseguire direttamente
    const jobId = downloadQueue.addJob(userId, {
      url,
      thumbnailUrl: thumbnailUrl || null,
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
  const { id: jobId, userId, url, thumbnailUrl } = job;

  try {
    downloadQueue.updateJob(jobId, { status: 'downloading', progress: 0 });

    console.log(`[YouTube Download] Inizio download job ${jobId} per URL: ${url}, User ID: ${userId}`);

    // Risolvi percorso yt-dlp
    let ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
    
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
          downloadQueue.updateJob(jobId, { progress: Math.min(progress, 99) });
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

    // Estrai metadati
    console.log(`[YouTube Download] Job ${jobId}: Estrazione metadati...`);
    downloadQueue.updateJob(jobId, { progress: 95 });
    const metadata = await extractMetadata(filePath);

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
      track: result.rows[0],
    });

    downloadQueue.jobFinished(userId, jobId);
  } catch (error) {
    console.error(`[YouTube Download] Job ${jobId}: Errore:`, error.message);
    downloadQueue.updateJob(jobId, {
      status: 'failed',
      error: error.message,
    });
    downloadQueue.jobFinished(userId, jobId);
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
          
          // Estrai informazioni essenziali
          const result = {
            id: videoData.id || null,
            title: videoData.title || 'Senza titolo',
            channel: videoData.channel || videoData.uploader || 'Canale sconosciuto',
            duration: videoData.duration || 0,
            thumbnail_url: videoData.thumbnail || videoData.thumbnails?.[0]?.url || null,
            description: videoData.description ? videoData.description.substring(0, 200) : '',
            view_count: videoData.view_count || 0,
            url: videoData.webpage_url || `https://www.youtube.com/watch?v=${videoData.id}`,
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


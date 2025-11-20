import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { extractMetadata, saveCoverArt } from '../utils/audioMetadata.js';
import { getTrackStoragePath, ensureDirectoryExists, getStoragePath, getFileStats } from '../utils/storage.js';
import { z } from 'zod';

const execAsync = promisify(exec);

const downloadSchema = z.object({
  url: z.string().url('URL non valido'),
});

const searchSchema = z.object({
  q: z.string().min(1, 'Query di ricerca non può essere vuota'),
  limit: z.enum(['5', '10', '20', '50']).default('10'),
});

export const downloadYouTube = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const validatedData = downloadSchema.parse(req.body);
    const { url } = validatedData;

    console.log(`[YouTube Download] Inizio download per URL: ${url}, User ID: ${userId}`);

    // Usa il percorso dal .env o cerca nel PATH
    let ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
    
    // Se è un percorso assoluto, verifica che esista
    if (ytdlpPath.startsWith('/')) {
      try {
        await fs.access(ytdlpPath);
      } catch (error) {
        console.error(`[YouTube Download] yt-dlp non trovato al percorso: ${ytdlpPath}`);
        // Prova a cercare nel PATH
        try {
          const { stdout } = await execAsync('which yt-dlp', { maxBuffer: 1024 });
          ytdlpPath = stdout.trim();
          console.log(`[YouTube Download] Trovato yt-dlp nel PATH: ${ytdlpPath}`);
        } catch (pathError) {
          throw new AppError('yt-dlp non è installato o non è nel PATH. Verifica l\'installazione.', 500);
        }
      }
    } else {
      // Se è solo il nome del comando, verifica che sia nel PATH
      try {
        const { stdout } = await execAsync(`which ${ytdlpPath}`, { maxBuffer: 1024 });
        ytdlpPath = stdout.trim();
        console.log(`[YouTube Download] yt-dlp trovato nel PATH: ${ytdlpPath}`);
      } catch (error) {
        console.error(`[YouTube Download] yt-dlp non trovato nel PATH: ${ytdlpPath}`);
        throw new AppError('yt-dlp non è installato o non è nel PATH. Verifica l\'installazione.', 500);
      }
    }
    
    const storagePath = getStoragePath();
    const tempDir = path.join(storagePath, 'temp', 'youtube');
    await ensureDirectoryExists(tempDir);

    // Get list of files before download
    const filesBefore = await fs.readdir(tempDir);
    
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `%(title)s-${timestamp}.%(ext)s`);

    console.log(`[YouTube Download] Comando yt-dlp: preparazione...`);
    console.log(`[YouTube Download] yt-dlp path: ${ytdlpPath}`);
    console.log(`[YouTube Download] Output path: ${outputPath}`);

    // Download audio con parsing metadati nativo di yt-dlp
    // --no-playlist: scarica solo il video specificato, non l'intera playlist
    // --parse-metadata parsare titoli nel formato "Artista - Titolo"
    // --embed-metadata incorporare i metadati nel file audio
    // Nota: --replace-in-metadata rimosso per problemi di escape delle regex nella shell
    const command = `${ytdlpPath} --no-playlist -x --audio-format mp3 --audio-quality 192K --parse-metadata "title:%(artist)s - %(title)s" --embed-metadata -o "${outputPath}" "${url}"`;
    
    console.log(`[YouTube Download] Esecuzione comando yt-dlp...`);
    const startTime = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync(command, { 
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000 // 5 minuti timeout
      });
      const duration = Date.now() - startTime;
      console.log(`[YouTube Download] Comando completato in ${duration}ms`);
      if (stdout) {
        console.log(`[YouTube Download] stdout: ${stdout.substring(0, 1000)}`);
      }
      if (stderr) {
        console.log(`[YouTube Download] stderr: ${stderr.substring(0, 1000)}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[YouTube Download] Errore dopo ${duration}ms:`, error.message);
      console.error(`[YouTube Download] stdout:`, error.stdout?.substring(0, 1000));
      console.error(`[YouTube Download] stderr:`, error.stderr?.substring(0, 1000));
      const errorMessage = error.stderr?.includes('ERROR') 
        ? error.stderr.split('ERROR')[1]?.substring(0, 200) || error.message
        : error.message;
      throw new AppError('Errore durante il download da YouTube: ' + errorMessage, 500);
    }

    console.log(`[YouTube Download] Ricerca file scaricato...`);

    // Find downloaded file (new files after download)
    const filesAfter = await fs.readdir(tempDir);
    const newFiles = filesAfter.filter(f => !filesBefore.includes(f));
    
    let downloadedFile = null;
    
    if (newFiles.length > 0) {
      downloadedFile = newFiles[0];
    } else {
      // Try to find by timestamp
      const filesByTimestamp = filesAfter.filter(f => f.includes(timestamp.toString()));
      if (filesByTimestamp.length > 0) {
        const testPath = path.join(tempDir, filesByTimestamp[0]);
        // Check if it's a file (not directory)
        const stats = await fs.stat(testPath);
        if (stats.isFile()) {
          downloadedFile = filesByTimestamp[0];
        }
      }
    }
    
    if (!downloadedFile) {
      console.error(`[YouTube Download] File non trovato. Files prima: ${filesBefore.length}, Files dopo: ${filesAfter.length}`);
      throw new AppError('File scaricato non trovato. Verifica che yt-dlp sia installato correttamente.', 500);
    }

    console.log(`[YouTube Download] File trovato: ${downloadedFile}`);

    const filePath = path.join(tempDir, downloadedFile);

    // Extract metadata from audio file
    // I metadati sono già stati parsati e incorporati da yt-dlp con --parse-metadata e --embed-metadata
    console.log(`[YouTube Download] Estrazione metadati...`);
    const metadata = await extractMetadata(filePath);
    console.log(`[YouTube Download] Metadati estratti: title=${metadata.title}, artist=${metadata.artist}`);

    // Determine final storage path using metadata
    console.log(`[YouTube Download] Determinazione percorso di salvataggio...`);
    const finalPath = getTrackStoragePath(userId, metadata.artist, metadata.album);
    await ensureDirectoryExists(finalPath);

    // Move file to final location
    console.log(`[YouTube Download] Spostamento file in: ${finalPath}`);
    const finalFilePath = path.join(finalPath, path.basename(filePath));
    await fs.rename(filePath, finalFilePath);

    // Get file stats
    console.log(`[YouTube Download] Lettura statistiche file...`);
    const stats = await getFileStats(finalFilePath);

    // Save cover art if available
    console.log(`[YouTube Download] Salvataggio cover art...`);
    let coverArtPath = null;
    if (metadata.picture) {
      coverArtPath = await saveCoverArt(
        metadata.picture,
        userId,
        metadata.album,
        storagePath
      );
    }

    // Insert track into database using metadata (già parsato da yt-dlp)
    console.log(`[YouTube Download] Inserimento nel database...`);
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

    console.log(`[YouTube Download] Download completato con successo. Track ID: ${result.rows[0].id}`);
    
    res.status(201).json({
      success: true,
      data: {
        track: result.rows[0],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

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


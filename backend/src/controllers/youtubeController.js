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

export const downloadYouTube = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const validatedData = downloadSchema.parse(req.body);
    const { url } = validatedData;

    const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
    const storagePath = getStoragePath();
    const tempDir = path.join(storagePath, 'temp', 'youtube');
    await ensureDirectoryExists(tempDir);

    // Get list of files before download
    const filesBefore = await fs.readdir(tempDir);
    
    const timestamp = Date.now();
    const outputPath = path.join(tempDir, `%(title)s-${timestamp}.%(ext)s`);

    // Download audio
    const command = `${ytdlpPath} -x --audio-format mp3 --audio-quality 192K -o "${outputPath}" "${url}"`;
    
    try {
      await execAsync(command);
    } catch (error) {
      console.error('yt-dlp error:', error);
      throw new AppError('Errore durante il download da YouTube: ' + (error.message || 'Errore sconosciuto'), 500);
    }

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
      throw new AppError('File scaricato non trovato. Verifica che yt-dlp sia installato correttamente.', 500);
    }

    const filePath = path.join(tempDir, downloadedFile);

    // Extract metadata
    const metadata = await extractMetadata(filePath);

    // Determine final storage path
    const finalPath = getTrackStoragePath(userId, metadata.artist, metadata.album);
    await ensureDirectoryExists(finalPath);

    // Move file to final location
    const finalFilePath = path.join(finalPath, path.basename(filePath));
    await fs.rename(filePath, finalFilePath);

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


import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { ensureDirectoryExists } from './storage.js';

/**
 * Divide un file audio in più tracce basandosi sui timestamp
 * 
 * @param {string} inputPath - Percorso del file audio da dividere
 * @param {Array<{startTime: number, endTime: number|null, title: string}>} tracks - Array di tracce con timestamp
 * @param {string} outputDir - Directory dove salvare le tracce divise
 * @param {Function} progressCallback - Callback per aggiornare il progresso (opzionale)
 * @returns {Promise<Array<{path: string, title: string, startTime: number, endTime: number}>>}
 */
export async function splitAudioFile(inputPath, tracks, outputDir, progressCallback = null) {
  if (!tracks || tracks.length === 0) {
    throw new Error('Nessuna traccia specificata per la divisione');
  }

  await ensureDirectoryExists(outputDir);

  const inputExt = path.extname(inputPath);
  const splitTracks = [];

  // Verifica che il file esista
  try {
    await fs.access(inputPath);
  } catch (error) {
    throw new Error(`File audio non trovato: ${inputPath}`);
  }

  // Dividi ogni traccia
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const { startTime, endTime, title } = track;

    if (progressCallback) {
      progressCallback({
        current: i + 1,
        total: tracks.length,
        track: title,
      });
    }

    // Crea nome file sicuro dal titolo
    const safeTitle = (title || `Track ${i + 1}`)
      .replace(/[^a-z0-9]/gi, '-')
      .substring(0, 100)
      .toLowerCase();
    
    const trackNumber = (i + 1).toString().padStart(2, '0');
    const outputFilename = `${trackNumber}-${safeTitle}${inputExt}`;
    const outputPath = path.join(outputDir, outputFilename);

    await new Promise((resolve, reject) => {
      // Calcola durata: se endTime è null, usa durata fino alla fine del file
      // Altrimenti calcola la differenza tra endTime e startTime
      const duration = endTime && endTime > startTime ? endTime - startTime : null;
      
      console.log(`[Audio Splitter] Traccia "${title}": startTime=${startTime}s, endTime=${endTime || 'null'}s, duration=${duration || 'fino alla fine'}s`);
      
      const command = ffmpeg(inputPath)
        .seekInput(startTime)
        .output(outputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('192k');
      
      if (duration && duration > 0) {
        command.duration(duration);
      }
      
      command
        .on('start', (commandLine) => {
          console.log(`[Audio Splitter] Comando: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progressCallback) {
            const percent = Math.round((progress.percent || 0) / tracks.length);
            progressCallback({
              current: i + 1,
              total: tracks.length,
              track: title,
              percent: percent,
            });
          }
        })
        .on('end', () => {
          console.log(`[Audio Splitter] Traccia ${i + 1}/${tracks.length} creata: ${outputFilename}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[Audio Splitter] Errore creazione traccia ${i + 1}:`, err.message);
          reject(new Error(`Errore divisione traccia "${title}": ${err.message}`));
        });

      command.run();
    });

    splitTracks.push({
      path: outputPath,
      title: title || `Track ${i + 1}`,
      startTime,
      endTime: endTime || null,
      trackNumber: i + 1,
    });
  }

  return splitTracks;
}

/**
 * Verifica che FFmpeg sia disponibile
 */
export async function checkFFmpegAvailable() {
  return new Promise((resolve) => {
    ffmpeg.getAvailableEncoders((err, encoders) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}


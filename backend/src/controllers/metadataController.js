import { AppError } from '../middleware/errorHandler.js';
import { processTrack, processMissingMetadata } from '../services/metadataBatchService.js';
import { recognizeWithShazam, isShazamAvailable } from '../utils/shazamService.js';
import { getStoragePath } from '../utils/storage.js';
import path from 'path';
import pool from '../database/db.js';
import { z } from 'zod';

const processTrackSchema = z.object({
  trackId: z.number().int().positive(),
});

/**
 * Processa una singola traccia per completare metadati
 * POST /api/metadata/process/:trackId
 */
export const processSingleTrack = async (req, res, next) => {
  try {
    const trackId = parseInt(req.params.trackId, 10);
    
    if (!trackId || isNaN(trackId)) {
      throw new AppError('ID traccia non valido', 400);
    }
    
    // Verifica che la traccia esista
    const trackCheck = await pool.query('SELECT id FROM tracks WHERE id = $1', [trackId]);
    if (trackCheck.rows.length === 0) {
      throw new AppError('Traccia non trovata', 404);
    }
    
    // Processa traccia (non bloccante, ritorna subito)
    processTrack(trackId).catch(error => {
      console.error(`[Metadata API] Errore processing traccia ${trackId}:`, error.message);
    });
    
    res.json({
      success: true,
      message: 'Processing avviato',
      data: {
        trackId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Ottieni statistiche metadati
 * GET /api/metadata/stats
 */
export const getMetadataStats = async (req, res, next) => {
  try {
    // Conta tracce totali
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM tracks');
    const totalTracks = parseInt(totalResult.rows[0].count) || 0;

    // Conta tracce processate
    const processedResult = await pool.query(
      'SELECT COUNT(*) as count FROM tracks WHERE metadata_processed_at IS NOT NULL'
    );
    const processedTracks = parseInt(processedResult.rows[0].count) || 0;

    // Conta tracce riconosciute (con acoustid)
    const recognizedResult = await pool.query(
      'SELECT COUNT(*) as count FROM tracks WHERE acoustid IS NOT NULL'
    );
    const recognizedTracks = parseInt(recognizedResult.rows[0].count) || 0;

    res.json({
      success: true,
      data: {
        total: totalTracks,
        processed: processedTracks,
        recognized: recognizedTracks,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Processa tutte le tracce con metadati mancanti (admin only)
 * POST /api/metadata/process-all
 */
export const processAllTracks = async (req, res, next) => {
  try {
    // Verifica che sia admin
    if (!req.user.isAdmin) {
      throw new AppError('Accesso negato: richiesti privilegi admin', 403);
    }
    
    const limit = parseInt(req.body.limit) || 10;
    const rateLimitMs = parseInt(req.body.rateLimitMs) || 6000;
    
    if (limit < 1 || limit > 100) {
      throw new AppError('Limit deve essere tra 1 e 100', 400);
    }
    
    // Processa in background (non bloccante)
    processMissingMetadata(limit, rateLimitMs).then(stats => {
      console.log('[Metadata API] Batch completato:', stats);
    }).catch(error => {
      console.error('[Metadata API] Errore batch processing:', error.message);
    });
    
    res.json({
      success: true,
      message: 'Batch processing avviato',
      data: {
        limit,
        rateLimitMs,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Ottieni stato processing per una traccia
 * GET /api/metadata/status/:trackId
 */
export const getTrackStatus = async (req, res, next) => {
  try {
    const trackId = parseInt(req.params.trackId, 10);
    
    if (!trackId || isNaN(trackId)) {
      throw new AppError('ID traccia non valido', 400);
    }
    
    const result = await pool.query(
      `SELECT id, title, artist, album, metadata_processed_at, metadata_source, acoustid
       FROM tracks WHERE id = $1`,
      [trackId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError('Traccia non trovata', 404);
    }
    
    const track = result.rows[0];
    
    res.json({
      success: true,
      data: {
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        processed: track.metadata_processed_at !== null,
        processedAt: track.metadata_processed_at,
        source: track.metadata_source,
        acoustid: track.acoustid,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Riconosci traccia con Shazam
 * POST /api/metadata/shazam/:trackId
 */
export const recognizeWithShazamController = async (req, res, next) => {
  try {
    const trackId = parseInt(req.params.trackId, 10);
    
    if (!trackId || isNaN(trackId)) {
      throw new AppError('ID traccia non valido', 400);
    }
    
    // Verifica che Shazam sia disponibile
    if (!(await isShazamAvailable())) {
      throw new AppError('Shazam non disponibile. Assicurati che Python e ShazamIO siano installati.', 503);
    }
    
    // Verifica che la traccia esista
    const trackResult = await pool.query(
      'SELECT id, file_path FROM tracks WHERE id = $1',
      [trackId]
    );
    
    if (trackResult.rows.length === 0) {
      throw new AppError('Traccia non trovata', 404);
    }
    
    const track = trackResult.rows[0];
    const audioFilePath = path.join(getStoragePath('tracks'), track.file_path);
    
    // Riconosci con Shazam
    const metadata = await recognizeWithShazam(audioFilePath);
    
    if (!metadata) {
      return res.json({
        success: false,
        message: 'Traccia non riconosciuta da Shazam',
      });
    }
    
    // Aggiorna metadati nel database
    const updateQuery = `
      UPDATE tracks
      SET 
        title = COALESCE($1, title),
        artist = COALESCE($2, artist),
        album = COALESCE($3, album),
        genre = COALESCE($4, genre),
        year = COALESCE($5, year),
        metadata_processed_at = CURRENT_TIMESTAMP,
        metadata_source = 'shazam'
      WHERE id = $6
      RETURNING id, title, artist, album, genre, year
    `;
    
    const updateResult = await pool.query(updateQuery, [
      metadata.title,
      metadata.artist,
      metadata.album,
      metadata.genre,
      metadata.year,
      trackId,
    ]);
    
    res.json({
      success: true,
      message: 'Traccia riconosciuta con Shazam',
      data: {
        trackId,
        metadata: updateResult.rows[0],
      },
    });
  } catch (error) {
    next(error);
  }
};


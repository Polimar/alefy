import { AppError } from '../middleware/errorHandler.js';
import { processTrack, processMissingMetadata } from '../services/metadataBatchService.js';
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


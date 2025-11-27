import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import fs from 'fs/promises';
import { getStoragePath } from '../utils/storage.js';

export const getStats = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Get track count (tutte le tracce, non solo dell'utente)
    const trackCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM tracks'
    );
    const trackCount = parseInt(trackCountResult.rows[0].count);
    
    // Get metadata processing stats (con gestione errori se colonne non esistono)
    let metadataStats = { processed_count: 0, recognized_count: 0, acoustid_count: 0 };
    try {
      const metadataStatsResult = await pool.query(
        `SELECT 
          COUNT(*) FILTER (WHERE metadata_processed_at IS NOT NULL) as processed_count,
          COUNT(*) FILTER (WHERE metadata_source IS NOT NULL AND metadata_source != 'manual') as recognized_count,
          COUNT(*) FILTER (WHERE acoustid IS NOT NULL) as acoustid_count
         FROM tracks`
      );
      metadataStats = metadataStatsResult.rows[0] || metadataStats;
    } catch (error) {
      // Se le colonne non esistono (migrazione non eseguita), usa valori di default
      console.warn('[Stats] Colonne metadati non trovate, eseguire migrazione 004:', error.message);
      metadataStats = { processed_count: 0, recognized_count: 0, acoustid_count: 0 };
    }

    // Get total storage
    const storageResult = await pool.query(
      'SELECT COALESCE(SUM(file_size), 0) as total_size FROM tracks WHERE user_id = $1',
      [userId]
    );
    const totalSize = parseInt(storageResult.rows[0].total_size);

    // Get most played tracks
    const mostPlayedResult = await pool.query(
      `SELECT id, title, artist, play_count 
       FROM tracks 
       WHERE user_id = $1 
       ORDER BY play_count DESC 
       LIMIT 10`,
      [userId]
    );

    // Get top genres
    const topGenresResult = await pool.query(
      `SELECT genre, COUNT(*) as count 
       FROM tracks 
       WHERE user_id = $1 AND genre IS NOT NULL 
       GROUP BY genre 
       ORDER BY count DESC 
       LIMIT 10`,
      [userId]
    );

    // Get recent plays
    const recentPlaysResult = await pool.query(
      `SELECT t.id, t.title, t.artist, ph.played_at 
       FROM play_history ph
       JOIN tracks t ON ph.track_id = t.id
       WHERE ph.user_id = $1
       ORDER BY ph.played_at DESC
       LIMIT 20`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        trackCount,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        metadataStats: {
          total: trackCount,
          processed: parseInt(metadataStats.processed_count || 0),
          recognized: parseInt(metadataStats.recognized_count || 0),
          withAcoustid: parseInt(metadataStats.acoustid_count || 0),
        },
        mostPlayed: mostPlayedResult.rows,
        topGenres: topGenresResult.rows,
        recentPlays: recentPlaysResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}


import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import fs from 'fs/promises';
import { getStoragePath } from '../utils/storage.js';

export const getStats = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Get track count
    const trackCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM tracks WHERE user_id = $1',
      [userId]
    );
    const trackCount = parseInt(trackCountResult.rows[0].count);

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


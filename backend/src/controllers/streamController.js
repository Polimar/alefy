import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { getStoragePath } from '../utils/storage.js';
import fs from 'fs';
import path from 'path';

export const streamTrack = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { token } = req.query; // Token guest per condivisione
    
    let userId = null;
    
    // Se c'è un token guest, verifica che sia valido e associato a questa traccia
    if (token) {
      const tokenResult = await pool.query(
        'SELECT resource_type, resource_id FROM share_tokens WHERE token = $1',
        [token]
      );
      
      if (tokenResult.rows.length === 0) {
        throw new AppError('Token non valido', 401);
      }
      
      const { resource_type, resource_id } = tokenResult.rows[0];
      const trackId = parseInt(id, 10);
      
      if (resource_type === 'track') {
        // Token per traccia singola
        if (trackId !== resource_id) {
          throw new AppError('Token non valido per questa traccia', 403);
        }
      } else if (resource_type === 'playlist') {
        // Token per playlist: verifica che la traccia sia nella playlist
        const playlistTrackCheck = await pool.query(
          'SELECT pt.track_id FROM playlist_tracks pt WHERE pt.playlist_id = $1 AND pt.track_id = $2',
          [resource_id, trackId]
        );
        
        if (playlistTrackCheck.rows.length === 0) {
          throw new AppError('Token non valido per questa traccia', 403);
        }
      } else {
        throw new AppError('Token non valido', 401);
      }
      
      // Verifica che la traccia esista ancora
      const trackCheck = await pool.query('SELECT id FROM tracks WHERE id = $1', [trackId]);
      if (trackCheck.rows.length === 0) {
        throw new AppError('Traccia non più disponibile', 404);
      }
      
      // Token guest valido, procedi senza userId
    } else {
      // Autenticazione normale con JWT
      if (!req.user || !req.user.userId) {
        throw new AppError('Autenticazione richiesta', 401);
      }
      userId = req.user.userId;
    }

    // Get track from database - tracks are shared, no ownership check
    const result = await pool.query(
      'SELECT id, file_path, title FROM tracks WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Traccia non trovata', 404);
    }

    const track = result.rows[0];

    // Build full file path
    const storagePath = getStoragePath();
    const filePath = path.join(storagePath, track.file_path);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new AppError('File audio non trovato', 404);
    }

    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    const isDownload = req.query.download === '1' || req.query.download === 'true';
    const ext = path.extname(track.file_path) || '.mp3';
    const safeTitle = (track.title || 'track').replace(/[^\w\s\-\.]/g, '').trim() || 'track';
    const downloadFilename = `${safeTitle}${ext}`;

    const baseHeaders = {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000',
      ...(isDownload && {
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      }),
    };

    // Parse range header
    const range = req.headers.range;

    if (range) {
      // Parse range
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      // Validate range
      if (start >= fileSize || end >= fileSize) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`,
        });
        throw new AppError('Range non soddisfacibile', 416);
      }

      // Set headers for partial content
      res.status(206).set({
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
      });

      // Create read stream
      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.pipe(res);
    } else {
      // Stream entire file
      res.status(200).set({
        ...baseHeaders,
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
      });

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    }

    // Update play count and last played (solo se non è guest)
    if (userId) {
      pool.query(
        'UPDATE tracks SET play_count = play_count + 1, last_played_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      ).catch(err => console.error('Error updating play count:', err));

      // Log play history (solo per utenti autenticati)
      pool.query(
        'INSERT INTO play_history (user_id, track_id, played_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
        [userId, id]
      ).catch(err => console.error('Error logging play history:', err));
    }
  } catch (error) {
    next(error);
  }
};

export const getCoverArt = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { token } = req.query; // Token guest per condivisione
    
    // Se c'è un token guest, verifica che sia valido e associato a questa traccia
    if (token) {
      const tokenResult = await pool.query(
        'SELECT resource_type, resource_id FROM share_tokens WHERE token = $1',
        [token]
      );
      
      if (tokenResult.rows.length === 0) {
        throw new AppError('Token non valido', 401);
      }
      
      const { resource_type, resource_id } = tokenResult.rows[0];
      const trackId = parseInt(id, 10);
      
      if (resource_type === 'track') {
        // Token per traccia singola
        if (trackId !== resource_id) {
          throw new AppError('Token non valido per questa traccia', 403);
        }
      } else if (resource_type === 'playlist') {
        // Token per playlist: verifica che la traccia sia nella playlist
        const playlistTrackCheck = await pool.query(
          'SELECT pt.track_id FROM playlist_tracks pt WHERE pt.playlist_id = $1 AND pt.track_id = $2',
          [resource_id, trackId]
        );
        
        if (playlistTrackCheck.rows.length === 0) {
          throw new AppError('Token non valido per questa traccia', 403);
        }
      } else {
        throw new AppError('Token non valido', 401);
      }
      
      // Verifica che la traccia esista ancora
      const trackCheck = await pool.query('SELECT id FROM tracks WHERE id = $1', [trackId]);
      if (trackCheck.rows.length === 0) {
        throw new AppError('Traccia non più disponibile', 404);
      }
    } else {
      // Autenticazione normale con JWT
      if (!req.user || !req.user.userId) {
        throw new AppError('Autenticazione richiesta', 401);
      }
    }

    // Get track from database - tracks are shared, no ownership check
    const result = await pool.query(
      'SELECT id, cover_art_path FROM tracks WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Traccia non trovata', 404);
    }

    const track = result.rows[0];

    if (!track.cover_art_path) {
      throw new AppError('Copertina non disponibile', 404);
    }

    // Build full file path
    const storagePath = getStoragePath();
    const filePath = path.join(storagePath, track.cover_art_path);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new AppError('File copertina non trovato', 404);
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
};


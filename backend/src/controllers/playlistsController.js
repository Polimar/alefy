import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { getStoragePath } from '../utils/storage.js';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

const createPlaylistSchema = z.object({
  name: z.string().min(1, 'Nome playlist richiesto').max(255),
  description: z.string().optional(),
  is_public: z.boolean().optional().default(false),
});

const updatePlaylistSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  is_public: z.boolean().optional(),
});

const addTrackSchema = z.object({
  track_id: z.number().int().positive(),
  position: z.number().int().nonnegative().optional(),
});

export const getPlaylists = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const addable = req.query.addable === 'true';

    if (addable) {
      // Per modal "Aggiungi a playlist": proprie + pubbliche di altri (aggiungibili)
      const result = await pool.query(
        `SELECT p.*, 
         u.username as creator_username,
         COUNT(pt.track_id) as track_count,
         COALESCE(SUM(t.duration), 0) as total_duration,
         (p.user_id != $1 AND p.is_public = true) as is_shared,
         (
           SELECT t2.cover_art_path 
           FROM playlist_tracks pt2
           JOIN tracks t2 ON pt2.track_id = t2.id
           WHERE pt2.playlist_id = p.id
           ORDER BY pt2.position ASC
           LIMIT 1
         ) as first_track_cover_art_path,
         (
           SELECT t2.id 
           FROM playlist_tracks pt2
           JOIN tracks t2 ON pt2.track_id = t2.id
           WHERE pt2.playlist_id = p.id
           ORDER BY pt2.position ASC
           LIMIT 1
         ) as first_track_id
         FROM playlists p
         LEFT JOIN users u ON p.user_id = u.id
         LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
         LEFT JOIN tracks t ON pt.track_id = t.id
         WHERE p.user_id = $1 OR (p.is_public = true AND p.user_id != $1)
         GROUP BY p.id, u.username
         ORDER BY p.user_id = $1 DESC, p.created_at DESC`,
        [userId]
      );

      return res.json({
        success: true,
        data: {
          playlists: result.rows,
        },
      });
    }

    // Solo playlist proprie (default)
    const result = await pool.query(
      `SELECT p.*, 
       COUNT(pt.track_id) as track_count,
       COALESCE(SUM(t.duration), 0) as total_duration,
       (
         SELECT t2.cover_art_path 
         FROM playlist_tracks pt2
         JOIN tracks t2 ON pt2.track_id = t2.id
         WHERE pt2.playlist_id = p.id
         ORDER BY pt2.position ASC
         LIMIT 1
       ) as first_track_cover_art_path,
       (
         SELECT t2.id 
         FROM playlist_tracks pt2
         JOIN tracks t2 ON pt2.track_id = t2.id
         WHERE pt2.playlist_id = p.id
         ORDER BY pt2.position ASC
         LIMIT 1
       ) as first_track_id
       FROM playlists p
       LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
       LEFT JOIN tracks t ON pt.track_id = t.id
       WHERE p.user_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        playlists: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicPlaylists = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
       u.username as creator_username,
       COUNT(pt.track_id) as track_count,
       COALESCE(SUM(t.duration), 0) as total_duration,
       (
         SELECT t2.cover_art_path 
         FROM playlist_tracks pt2
         JOIN tracks t2 ON pt2.track_id = t2.id
         WHERE pt2.playlist_id = p.id
         ORDER BY pt2.position ASC
         LIMIT 1
       ) as first_track_cover_art_path,
       (
         SELECT t2.id 
         FROM playlist_tracks pt2
         JOIN tracks t2 ON pt2.track_id = t2.id
         WHERE pt2.playlist_id = p.id
         ORDER BY pt2.position ASC
         LIMIT 1
       ) as first_track_id
       FROM playlists p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
       LEFT JOIN tracks t ON pt.track_id = t.id
       WHERE p.is_public = true
       GROUP BY p.id, u.username
       ORDER BY p.created_at DESC`,
      []
    );

    res.json({
      success: true,
      data: {
        playlists: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Get playlist info - allow access if public or user is owner
    const playlistResult = await pool.query(
      `SELECT p.*, 
       u.username as creator_username,
       COUNT(pt.track_id) as track_count,
       COALESCE(SUM(t.duration), 0) as total_duration
       FROM playlists p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
       LEFT JOIN tracks t ON pt.track_id = t.id
       WHERE p.id = $1 AND (p.is_public = true OR p.user_id = $2)
       GROUP BY p.id, u.username`,
      [id, userId]
    );

    if (playlistResult.rows.length === 0) {
      throw new AppError('Playlist non trovata', 404);
    }

    // Get tracks (tracks are shared, no user_id filter)
    const tracksResult = await pool.query(
      `SELECT t.*, pt.position, pt.added_at
       FROM playlist_tracks pt
       JOIN tracks t ON pt.track_id = t.id
       WHERE pt.playlist_id = $1
       ORDER BY pt.position ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        playlist: {
          ...playlistResult.rows[0],
          tracks: tracksResult.rows,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createPlaylist = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const validatedData = createPlaylistSchema.parse(req.body);

    const result = await pool.query(
      'INSERT INTO playlists (user_id, name, description, is_public) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, validatedData.name, validatedData.description || null, validatedData.is_public]
    );

    res.status(201).json({
      success: true,
      data: {
        playlist: result.rows[0],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

export const updatePlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const checkResult = await pool.query(
      'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      throw new AppError('Playlist non trovata', 404);
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    // Handle cover art upload if present
    if (req.file) {
      try {
        const storagePath = getStoragePath();
        const coversDir = path.join(storagePath, 'playlists', 'covers');
        await fs.mkdir(coversDir, { recursive: true });

        // Generate unique filename
        const fileExt = path.extname(req.file.originalname) || '.jpg';
        const coverFilename = `playlist_${id}_${Date.now()}${fileExt}`;
        const coverPath = path.join(coversDir, coverFilename);

        // Resize and save cover art
        await sharp(req.file.path)
          .resize(300, 300, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({ quality: 90 })
          .toFile(coverPath);

        // Delete old cover if exists
        const oldCoverResult = await pool.query(
          'SELECT cover_art_path FROM playlists WHERE id = $1',
          [id]
        );
        if (oldCoverResult.rows[0]?.cover_art_path) {
          const oldCoverPath = path.join(storagePath, oldCoverResult.rows[0].cover_art_path);
          try {
            await fs.unlink(oldCoverPath);
          } catch (err) {
            // Ignore if file doesn't exist
            console.warn('Could not delete old playlist cover:', err.message);
          }
        }

        // Save relative path
        const relativeCoverPath = path.join('playlists', 'covers', coverFilename).replace(/\\/g, '/');
        updates.push(`cover_art_path = $${paramIndex}`);
        values.push(relativeCoverPath);
        paramIndex++;

        // Delete temp file
        await fs.unlink(req.file.path);
      } catch (error) {
        // Clean up temp file on error
        if (req.file?.path) {
          try {
            await fs.unlink(req.file.path);
          } catch (e) {
            // Ignore
          }
        }
        throw new AppError(`Errore nel salvataggio della cover art: ${error.message}`, 500);
      }
    }

    // Handle other fields
    const bodyData = req.body;
    const validatedData = updatePlaylistSchema.parse({
      name: bodyData.name,
      description: bodyData.description,
      is_public: bodyData.is_public === 'true' || bodyData.is_public === true,
    });

    Object.keys(validatedData).forEach(key => {
      if (validatedData[key] !== undefined && validatedData[key] !== null && validatedData[key] !== '') {
        updates.push(`${key} = $${paramIndex}`);
        values.push(validatedData[key]);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      throw new AppError('Nessun campo da aggiornare', 400);
    }

    values.push(id, userId);
    const query = `UPDATE playlists SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: {
        playlist: result.rows[0],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

export const deletePlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const checkResult = await pool.query(
      'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      throw new AppError('Playlist non trovata', 404);
    }

    // Elimina anche i token di condivisione associati alla playlist
    try {
      await pool.query('DELETE FROM share_tokens WHERE resource_type = $1 AND resource_id = $2', ['playlist', id]);
    } catch (tokenError) {
      console.warn('Errore eliminazione token playlist:', tokenError);
      // Non bloccare l'eliminazione della playlist se fallisce l'eliminazione dei token
    }

    // Delete playlist (cascade will delete playlist_tracks)
    await pool.query('DELETE FROM playlists WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({
      success: true,
      message: 'Playlist eliminata con successo',
    });
  } catch (error) {
    next(error);
  }
};

export const addTrack = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const validatedData = addTrackSchema.parse(req.body);

    // Check playlist: user must be owner OR playlist must be public (addable by anyone)
    const playlistResult = await pool.query(
      'SELECT id FROM playlists WHERE id = $1 AND (user_id = $2 OR is_public = true)',
      [id, userId]
    );

    if (playlistResult.rows.length === 0) {
      throw new AppError('Playlist non trovata', 404);
    }

    // Check if track exists (tracks are shared, no ownership check)
    const trackResult = await pool.query(
      'SELECT id FROM tracks WHERE id = $1',
      [validatedData.track_id]
    );

    if (trackResult.rows.length === 0) {
      throw new AppError('Traccia non trovata', 404);
    }

    // Check if track already in playlist
    const existingResult = await pool.query(
      'SELECT id FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2',
      [id, validatedData.track_id]
    );

    if (existingResult.rows.length > 0) {
      throw new AppError('Traccia già presente nella playlist', 409);
    }

    // Get max position if not specified
    let position = validatedData.position;
    if (position === undefined) {
      const maxResult = await pool.query(
        'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM playlist_tracks WHERE playlist_id = $1',
        [id]
      );
      position = parseInt(maxResult.rows[0].next_position);
    } else {
      // Shift positions if needed
      await pool.query(
        'UPDATE playlist_tracks SET position = position + 1 WHERE playlist_id = $1 AND position >= $2',
        [id, position]
      );
    }

    // Add track
    await pool.query(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3)',
      [id, validatedData.track_id, position]
    );

    res.status(201).json({
      success: true,
      message: 'Traccia aggiunta alla playlist',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

export const removeTrack = async (req, res, next) => {
  try {
    const { id, trackId } = req.params;
    const userId = req.user.userId;

    // Check playlist ownership
    const playlistResult = await pool.query(
      'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (playlistResult.rows.length === 0) {
      throw new AppError('Playlist non trovata', 404);
    }

    // Get position before deleting
    const positionResult = await pool.query(
      'SELECT position FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2',
      [id, trackId]
    );

    if (positionResult.rows.length === 0) {
      throw new AppError('Traccia non trovata nella playlist', 404);
    }

    const position = positionResult.rows[0].position;

    // Delete track
    await pool.query(
      'DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2',
      [id, trackId]
    );

    // Shift positions
    await pool.query(
      'UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = $1 AND position > $2',
      [id, position]
    );

    res.json({
      success: true,
      message: 'Traccia rimossa dalla playlist',
    });
  } catch (error) {
    next(error);
  }
};

export const reorderTracks = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { track_ids } = req.body;

    if (!Array.isArray(track_ids) || track_ids.length === 0) {
      throw new AppError('Array di track_ids richiesto', 400);
    }

    // Check playlist ownership
    const playlistResult = await pool.query(
      'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (playlistResult.rows.length === 0) {
      throw new AppError('Playlist non trovata', 404);
    }

    // Update positions
    await pool.query('BEGIN');
    try {
      for (let i = 0; i < track_ids.length; i++) {
        await pool.query(
          'UPDATE playlist_tracks SET position = $1 WHERE playlist_id = $2 AND track_id = $3',
          [i, id, track_ids[i]]
        );
      }
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    res.json({
      success: true,
      message: 'Ordine tracce aggiornato',
    });
  } catch (error) {
    next(error);
  }
};


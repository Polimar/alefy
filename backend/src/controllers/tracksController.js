import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { getStoragePath } from '../utils/storage.js';
import { saveCoverArt } from '../utils/audioMetadata.js';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

const updateTrackSchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  album_artist: z.string().optional(),
  genre: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  track_number: z.number().int().positive().optional(),
  disc_number: z.number().int().positive().optional(),
});

export const getTracks = async (req, res, next) => {
  try {
    // Tracks are now shared - show all tracks from all users
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    // Build query with filters - removed user_id filter to show all tracks
    let query = 'SELECT id, title, artist, album, album_artist, genre, year, track_number, disc_number, duration, file_size, cover_art_path, play_count, last_played_at, created_at FROM tracks WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Search filter
    if (req.query.search) {
      query += ` AND (title ILIKE $${paramIndex} OR artist ILIKE $${paramIndex} OR album ILIKE $${paramIndex})`;
      params.push(`%${req.query.search}%`);
      paramIndex++;
    }

    // Genre filter
    if (req.query.genre) {
      query += ` AND genre = $${paramIndex}`;
      params.push(req.query.genre);
      paramIndex++;
    }

    // Year filter
    if (req.query.year) {
      query += ` AND year = $${paramIndex}`;
      params.push(parseInt(req.query.year));
      paramIndex++;
    }

    // Artist filter
    if (req.query.artist) {
      query += ` AND artist ILIKE $${paramIndex}`;
      params.push(`%${req.query.artist}%`);
      paramIndex++;
    }

    // Album filter
    if (req.query.album) {
      query += ` AND album ILIKE $${paramIndex}`;
      params.push(`%${req.query.album}%`);
      paramIndex++;
    }

    // Order by
    const orderBy = req.query.orderBy || 'created_at';
    const orderDir = req.query.orderDir === 'asc' ? 'ASC' : 'DESC';
    const allowedOrderBy = ['title', 'artist', 'album', 'year', 'created_at', 'play_count', 'last_played_at', 'duration'];
    const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'created_at';
    query += ` ORDER BY ${safeOrderBy} ${orderDir}`;

    // Get total count
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM').replace(/ORDER BY.*$/, '');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        tracks: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTrack = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Tracks are shared - no user_id filter
    const result = await pool.query(
      'SELECT * FROM tracks WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Traccia non trovata', 404);
    }

    res.json({
      success: true,
      data: {
        track: result.rows[0],
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateTrack = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const checkResult = await pool.query(
      'SELECT id, artist, album FROM tracks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      throw new AppError('Traccia non trovata', 404);
    }

    const track = checkResult.rows[0];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    // Handle cover art upload if present
    if (req.file) {
      try {
        const storagePath = getStoragePath();
        const coversDir = path.join(storagePath, 'covers');
        await fs.mkdir(coversDir, { recursive: true });

        // Generate unique filename
        const fileExt = path.extname(req.file.originalname) || '.jpg';
        const coverFilename = `cover_${id}_${Date.now()}${fileExt}`;
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
          'SELECT cover_art_path FROM tracks WHERE id = $1',
          [id]
        );
        if (oldCoverResult.rows[0]?.cover_art_path) {
          const oldCoverPath = path.join(storagePath, oldCoverResult.rows[0].cover_art_path);
          try {
            await fs.unlink(oldCoverPath);
          } catch (err) {
            // Ignore if file doesn't exist
            console.warn('Could not delete old cover:', err.message);
          }
        }

        // Save relative path
        const relativeCoverPath = path.join('covers', coverFilename).replace(/\\/g, '/');
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

    // Handle other metadata fields
    const bodyData = req.body;
    const validatedData = updateTrackSchema.parse({
      title: bodyData.title,
      artist: bodyData.artist,
      album: bodyData.album,
      album_artist: bodyData.album_artist,
      genre: bodyData.genre,
      year: bodyData.year ? parseInt(bodyData.year, 10) : undefined,
      track_number: bodyData.track_number ? parseInt(bodyData.track_number, 10) : undefined,
      disc_number: bodyData.disc_number ? parseInt(bodyData.disc_number, 10) : undefined,
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
    const query = `UPDATE tracks SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`;

    const result = await pool.query(query, values);

    res.json({
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

export const deleteTrack = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Get track info
    const trackResult = await pool.query(
      'SELECT file_path, cover_art_path FROM tracks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (trackResult.rows.length === 0) {
      throw new AppError('Traccia non trovata', 404);
    }

    const track = trackResult.rows[0];
    const storagePath = getStoragePath();

    // Delete file
    if (track.file_path) {
      const filePath = path.join(storagePath, track.file_path);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }

    // Delete cover art
    if (track.cover_art_path) {
      const coverPath = path.join(storagePath, track.cover_art_path);
      try {
        await fs.unlink(coverPath);
      } catch (error) {
        console.error('Error deleting cover art:', error);
      }
    }

    // Delete from database
    await pool.query('DELETE FROM tracks WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({
      success: true,
      message: 'Traccia eliminata con successo',
    });
  } catch (error) {
    next(error);
  }
};

export const getArtists = async (req, res, next) => {
  try {
    // Show all artists from all users (shared library)
    const result = await pool.query(
      `SELECT DISTINCT artist, COUNT(*) as track_count 
       FROM tracks 
       WHERE artist IS NOT NULL 
       GROUP BY artist 
       ORDER BY artist ASC`
    );

    res.json({
      success: true,
      data: {
        artists: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAlbums = async (req, res, next) => {
  try {
    // Show all albums from all users (shared library)
    const artist = req.query.artist;

    let query = `SELECT DISTINCT album, artist, COUNT(*) as track_count 
                 FROM tracks 
                 WHERE album IS NOT NULL`;
    const params = [];

    if (artist) {
      query += ` AND artist = $1`;
      params.push(artist);
      query += ` GROUP BY album, artist ORDER BY album ASC`;
    } else {
      query += ` GROUP BY album, artist ORDER BY artist ASC, album ASC`;
    }

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        albums: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getGenres = async (req, res, next) => {
  try {
    // Show all genres from all users (shared library)
    const result = await pool.query(
      `SELECT DISTINCT genre, COUNT(*) as track_count 
       FROM tracks 
       WHERE genre IS NOT NULL 
       GROUP BY genre 
       ORDER BY genre ASC`
    );

    res.json({
      success: true,
      data: {
        genres: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};


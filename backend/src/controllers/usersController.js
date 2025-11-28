import bcrypt from 'bcrypt';
import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(8, 'Password deve essere almeno 8 caratteri'),
  username: z.string().optional(),
});

export const createUser = async (req, res, next) => {
  try {
    const validatedData = createUserSchema.parse(req.body);
    const { email, password, username } = validatedData;

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new AppError('Email già registrata', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, username, is_admin) VALUES ($1, $2, $3, FALSE) RETURNING id, email, username, is_admin, created_at',
      [email, passwordHash, username || null]
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: result.rows[0].id,
          email: result.rows[0].email,
          username: result.rows[0].username,
          is_admin: result.rows[0].is_admin,
          created_at: result.rows[0].created_at,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

const updateUserSchema = z.object({
  email: z.string().email('Email non valida').optional(),
  username: z.string().optional(),
  password: z.string().min(8, 'Password deve essere almeno 8 caratteri').optional(),
  is_admin: z.boolean().optional(),
});

export const getUsers = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, email, username, is_admin, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      data: {
        users: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);

    // Get user info
    const userResult = await pool.query(
      'SELECT id, email, username, is_admin, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('Utente non trovato', 404);
    }

    const user = userResult.rows[0];

    // Get statistics
    const statsResult = await pool.query(
      `SELECT 
        COUNT(DISTINCT t.id) as track_count,
        COUNT(DISTINCT p.id) as playlist_count,
        COALESCE(SUM(t.file_size), 0) as total_storage_bytes,
        COALESCE(AVG(t.file_size), 0) as avg_file_size
      FROM users u
      LEFT JOIN tracks t ON u.id = t.user_id
      LEFT JOIN playlists p ON u.id = p.user_id
      WHERE u.id = $1
      GROUP BY u.id`,
      [userId]
    );

    // Get detailed format breakdown
    const formatBreakdownResult = await pool.query(
      `SELECT 
        COALESCE(file_format, 'NULL') as file_format,
        COUNT(*) as count,
        COALESCE(SUM(file_size), 0) as total_size,
        COALESCE(AVG(file_size), 0) as avg_size,
        COALESCE(AVG(bitrate), 0) as avg_bitrate,
        COALESCE(AVG(duration), 0) as avg_duration
      FROM tracks
      WHERE user_id = $1
      GROUP BY file_format
      ORDER BY total_size DESC`,
      [userId]
    );

    // Get diagnostic info: files with NULL format or suspicious sizes
    const diagnosticResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE file_format IS NULL OR file_format = '') as null_format_count,
        COALESCE(SUM(file_size) FILTER (WHERE file_format IS NULL OR file_format = ''), 0) as null_format_size,
        COUNT(*) FILTER (WHERE file_size = 0) as zero_size_count,
        COUNT(*) FILTER (WHERE file_size > 100000000) as large_file_count,
        COALESCE(SUM(file_size) FILTER (WHERE file_size > 100000000), 0) as large_file_size,
        COUNT(*) as total_tracks_in_db
      FROM tracks
      WHERE user_id = $1`,
      [userId]
    );

    const stats = statsResult.rows[0] || {
      track_count: 0,
      playlist_count: 0,
      total_storage_bytes: 0,
      avg_file_size: 0,
      format_count: 0,
      formats: [],
    };

    const diagnostic = diagnosticResult.rows[0] || {};

    res.json({
      success: true,
      data: {
        user: {
          ...user,
          stats: {
            trackCount: parseInt(stats.track_count) || 0,
            playlistCount: parseInt(stats.playlist_count) || 0,
            totalStorageBytes: parseInt(stats.total_storage_bytes) || 0,
            avgFileSize: parseInt(stats.avg_file_size) || 0,
            formatBreakdown: formatBreakdownResult.rows.map(row => ({
              format: row.file_format === 'NULL' ? null : row.file_format,
              count: parseInt(row.count) || 0,
              totalSize: parseInt(row.total_size) || 0,
              avgSize: parseInt(row.avg_size) || 0,
              avgBitrate: parseInt(row.avg_bitrate) || 0,
              avgDuration: parseInt(row.avg_duration) || 0,
            })),
            diagnostic: {
              nullFormatCount: parseInt(diagnostic.null_format_count) || 0,
              nullFormatSize: parseInt(diagnostic.null_format_size) || 0,
              zeroSizeCount: parseInt(diagnostic.zero_size_count) || 0,
              largeFileCount: parseInt(diagnostic.large_file_count) || 0,
              largeFileSize: parseInt(diagnostic.large_file_size) || 0,
              totalTracksInDb: parseInt(diagnostic.total_tracks_in_db) || 0,
            },
          },
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.userId;
    const userId = parseInt(id, 10);

    // Prevent self-deletion of admin status
    if (userId === currentUserId && req.body.is_admin === false) {
      throw new AppError('Non puoi rimuovere i tuoi privilegi di admin', 400);
    }

    const validatedData = updateUserSchema.parse(req.body);
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (validatedData.email !== undefined) {
      // Check if email already exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [validatedData.email, userId]
      );
      if (existingUser.rows.length > 0) {
        throw new AppError('Email già registrata', 409);
      }
      updates.push(`email = $${paramIndex}`);
      values.push(validatedData.email);
      paramIndex++;
    }

    if (validatedData.username !== undefined) {
      updates.push(`username = $${paramIndex}`);
      values.push(validatedData.username || null);
      paramIndex++;
    }

    if (validatedData.password !== undefined) {
      const passwordHash = await bcrypt.hash(validatedData.password, 10);
      updates.push(`password_hash = $${paramIndex}`);
      values.push(passwordHash);
      paramIndex++;
    }

    if (validatedData.is_admin !== undefined) {
      updates.push(`is_admin = $${paramIndex}`);
      values.push(validatedData.is_admin);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new AppError('Nessun campo da aggiornare', 400);
    }

    values.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING id, email, username, is_admin, created_at`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: {
        user: result.rows[0],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.userId;
    const userId = parseInt(id, 10);

    // Prevent self-deletion
    if (userId === currentUserId) {
      throw new AppError('Non puoi eliminare il tuo stesso account', 400);
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('Utente non trovato', 404);
    }

    // Delete user (cascade will handle related records)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({
      success: true,
      message: 'Utente eliminato con successo',
    });
  } catch (error) {
    next(error);
  }
};


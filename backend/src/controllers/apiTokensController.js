import crypto from 'crypto';
import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

const API_TOKEN_PREFIX = process.env.API_TOKEN_PREFIX || 'alefy_';

const createSchema = z.object({
  name: z.string().min(1, 'Nome richiesto').max(255),
  user_id: z.number().int().positive().optional(),
});

export const list = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT at.id, at.user_id, at.name, at.created_at, at.last_used_at
       FROM api_tokens at
       ORDER BY at.created_at DESC`
    );

    res.json({
      success: true,
      data: {
        tokens: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const create = async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse({
      ...req.body,
      user_id: req.body.user_id != null ? parseInt(req.body.user_id, 10) : undefined,
    });

    if (!parsed.success) {
      throw new AppError(parsed.error.errors?.[0]?.message || 'Dati non validi', 400);
    }

    const { name, user_id } = parsed.data;
    const userId = user_id ?? req.user.userId;

    const tokenSuffix = crypto.randomBytes(16).toString('hex');
    const tokenPlain = `${API_TOKEN_PREFIX}${tokenSuffix}`;
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');

    await pool.query(
      'INSERT INTO api_tokens (user_id, name, token_prefix, token_hash) VALUES ($1, $2, $3, $4)',
      [userId, name, API_TOKEN_PREFIX, tokenHash]
    );

    const row = await pool.query(
      'SELECT id, user_id, name, created_at FROM api_tokens WHERE token_hash = $1',
      [tokenHash]
    );

    res.status(201).json({
      success: true,
      data: {
        token: tokenPlain,
        id: row.rows[0].id,
        user_id: row.rows[0].user_id,
        name: row.rows[0].name,
        created_at: row.rows[0].created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const revoke = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new AppError('ID non valido', 400);
    }

    const result = await pool.query('DELETE FROM api_tokens WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      throw new AppError('Token non trovato', 404);
    }

    res.json({
      success: true,
      data: { message: 'Token revocato' },
    });
  } catch (error) {
    next(error);
  }
};

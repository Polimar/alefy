import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(8, 'Password deve essere almeno 8 caratteri'),
  username: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(1, 'Password richiesta'),
});

const generateTokens = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET non configurato nel file .env');
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET non configurato nel file .env');
  }

  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

export const register = async (req, res, next) => {
  try {
    const validatedData = registerSchema.parse(req.body);
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
      'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username, created_at',
      [email, passwordHash, username || null]
    );

    const user = result.rows[0];
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    console.log('[Login] Tentativo login per email:', req.body.email);
    logger.info('[Login] Tentativo login per email:', req.body.email);
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    // Find user
    logger.info('[Login] Ricerca utente nel database...');
    const result = await pool.query(
      'SELECT id, email, password_hash, username FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      logger.warn('[Login] Utente non trovato:', email);
      throw new AppError('Credenziali non valide', 401);
    }

    const user = result.rows[0];
    logger.info('[Login] Utente trovato, ID:', user.id);

    // Verify password
    logger.info('[Login] Verifica password...');
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      logger.warn('[Login] Password non valida per utente:', email);
      throw new AppError('Credenziali non valide', 401);
    }

    logger.info('[Login] Password valida, generazione token...');
    const { accessToken, refreshToken } = generateTokens(user.id);
    logger.info('[Login] Token generati con successo');

    // Store refresh token
    logger.info('[Login] Salvataggio refresh token nel database...');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );
    logger.info('[Login] Refresh token salvato nel database');

    logger.info('[Login] Login completato con successo per utente:', email);
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('[Login] Errore durante login:', error.message);
    console.error('[Login] Stack:', error.stack);
    logger.error('[Login] Errore durante login:', {
      message: error.message,
      stack: error.stack,
      email: req.body?.email,
    });
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token richiesto', 400);
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new AppError('Refresh token non valido', 401);
    }

    // Check if token exists in database
    const tokenResult = await pool.query(
      'SELECT user_id, expires_at FROM refresh_tokens WHERE token = $1',
      [refreshToken]
    );

    if (tokenResult.rows.length === 0) {
      throw new AppError('Refresh token non trovato', 401);
    }

    const tokenData = tokenResult.rows[0];

    if (new Date(tokenData.expires_at) < new Date()) {
      // Delete expired token
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      throw new AppError('Refresh token scaduto', 401);
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);

    // Update refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await pool.query(
      'UPDATE refresh_tokens SET token = $1, expires_at = $2 WHERE token = $3',
      [newRefreshToken, expiresAt, refreshToken]
    );

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }

    res.json({
      success: true,
      message: 'Logout effettuato con successo',
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, email, username, is_admin, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Utente non trovato', 404);
    }

    const user = result.rows[0];
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          is_admin: user.is_admin || false,
          created_at: user.created_at,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};


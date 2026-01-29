import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AppError } from './errorHandler.js';
import pool from '../database/db.js';

const API_TOKEN_PREFIX = process.env.API_TOKEN_PREFIX || 'alefy_';

/**
 * Valida un token API permanente. Ritorna { userId, isAdmin, authType: 'api_token' } o null.
 */
export async function validateApiToken(value) {
  if (!value || typeof value !== 'string') return null;
  if (!value.startsWith(API_TOKEN_PREFIX)) return null;
  if (value.length !== API_TOKEN_PREFIX.length + 32) return null;

  const hash = crypto.createHash('sha256').update(value).digest('hex');
  const result = await pool.query(
    'SELECT at.user_id, u.is_admin FROM api_tokens at JOIN users u ON u.id = at.user_id WHERE at.token_prefix = $1 AND at.token_hash = $2',
    [API_TOKEN_PREFIX, hash]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  await pool.query(
    'UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_prefix = $1 AND token_hash = $2',
    [API_TOKEN_PREFIX, hash]
  ).catch(() => {});

  return {
    userId: row.user_id,
    isAdmin: row.is_admin || false,
    authType: 'api_token',
  };
}

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token di autenticazione mancante', 401);
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userResult = await pool.query(
        'SELECT id, email, username, is_admin FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        throw new AppError('Utente non trovato', 401);
      }

      req.user = {
        userId: userResult.rows[0].id,
        isAdmin: userResult.rows[0].is_admin || false,
        authType: 'jwt',
      };
      return next();
    } catch (jwtError) {
      if (jwtError.name !== 'JsonWebTokenError' && jwtError.name !== 'TokenExpiredError') {
        return next(jwtError);
      }
    }

    const apiUser = await validateApiToken(token);
    if (apiUser) {
      req.user = apiUser;
      return next();
    }

    return next(new AppError('Token non valido', 401));
  } catch (error) {
    next(error);
  }
};

export const requireAdmin = async (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return next(new AppError('Accesso negato: privilegi amministratore richiesti', 403));
  }
  next();
};

/** Richiede autenticazione JWT (blocca l'uso di API token per route sensibili). */
export const requireJwt = async (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Autenticazione richiesta', 401));
  }
  if (req.user.authType === 'api_token') {
    return next(new AppError('Questa operazione richiede login dal browser', 403));
  }
  next();
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userResult = await pool.query(
          'SELECT id, email, username, is_admin FROM users WHERE id = $1',
          [decoded.userId]
        );
        if (userResult.rows.length > 0) {
          req.user = {
            userId: userResult.rows[0].id,
            isAdmin: userResult.rows[0].is_admin || false,
            authType: 'jwt',
          };
          return next();
        }
      } catch (error) {
        // Ignora JWT non valido, prova API token
      }

      const apiUser = await validateApiToken(token);
      if (apiUser) {
        req.user = apiUser;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

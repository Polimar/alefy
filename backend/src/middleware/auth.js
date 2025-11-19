import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';
import pool from '../database/db.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token di autenticazione mancante', 401);
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Load user info including is_admin
    const userResult = await pool.query(
      'SELECT id, email, username, is_admin FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new AppError('Utente non trovato', 401);
    }
    
    req.user = {
      userId: decoded.userId,
      isAdmin: userResult.rows[0].is_admin || false,
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Token non valido', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token scaduto', 401));
    }
    next(error);
  }
};

export const requireAdmin = async (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return next(new AppError('Accesso negato: privilegi amministratore richiesti', 403));
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
            userId: decoded.userId,
            isAdmin: userResult.rows[0].is_admin || false,
          };
        }
      } catch (error) {
        // Ignora errori di token per autenticazione opzionale
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
};


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


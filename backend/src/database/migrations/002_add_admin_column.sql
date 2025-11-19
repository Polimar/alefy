-- Migration: Add is_admin column to users table
-- Created: 2025-11-19

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- Set first user (admin) as admin
UPDATE users SET is_admin = TRUE WHERE email = 'valerio@free-ware.it';


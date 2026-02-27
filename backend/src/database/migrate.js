import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carica .env: prima backend/.env, poi root progetto (come serve.sh)
const backendEnv = path.join(__dirname, '../../.env');
const rootEnv = path.join(__dirname, '../../../.env');
const envPath = fs.existsSync(backendEnv) ? backendEnv : fs.existsSync(rootEnv) ? rootEnv : undefined;
if (envPath) dotenv.config({ path: envPath }); else dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'alefy'}:${process.env.POSTGRES_PASSWORD || 'alefy_password'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'alefy_db'}`
});

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get executed migrations
    const executedResult = await client.query('SELECT name FROM migrations ORDER BY id');
    const executed = new Set(executedResult.rows.map(r => r.name));

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files`);

    // Execute pending migrations
    for (const file of files) {
      if (executed.has(file)) {
        console.log(`Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`Executing ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✓ ${file} executed successfully`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();


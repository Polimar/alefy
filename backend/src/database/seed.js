import bcrypt from 'bcrypt';
import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'alefy'}:${process.env.POSTGRES_PASSWORD || 'alefy_password'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'alefy_db'}`
});

async function seed() {
  try {
    await client.connect();
    console.log('Connesso al database');

    const email = 'valerio@free-ware.it';
    const password = 'La_F3ss4_d3_Mamm3ta';

    // Check if admin user already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      console.log('Utente admin già esistente, aggiorno la password e is_admin...');
      const passwordHash = await bcrypt.hash(password, 10);
      await client.query(
        'UPDATE users SET password_hash = $1, is_admin = TRUE WHERE email = $2',
        [passwordHash, email]
      );
      console.log('✓ Password admin aggiornata e is_admin impostato');
    } else {
      console.log('Creazione utente admin...');
      const passwordHash = await bcrypt.hash(password, 10);
      await client.query(
        'INSERT INTO users (email, password_hash, username, is_admin) VALUES ($1, $2, $3, TRUE)',
        [email, passwordHash, 'admin']
      );
      console.log('✓ Utente admin creato con successo');
      console.log(`  Email: ${email}`);
      console.log(`  Password: ${password}`);
    }

    console.log('Seeding completato');
  } catch (error) {
    console.error('Errore durante il seeding:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();


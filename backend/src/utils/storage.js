import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import pool from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root del progetto (backend/src/utils -> ../../..)
const PROJECT_ROOT = path.join(__dirname, '../../..');

export const getStoragePath = () => {
  const raw = process.env.STORAGE_PATH || 'storage';
  return path.isAbsolute(raw)
    ? raw
    : path.join(PROJECT_ROOT, raw.replace(/^\.\//, ''));
};

export const getUserStoragePath = (userId) => {
  const basePath = getStoragePath();
  return path.join(basePath, 'users', userId.toString());
};

export const getTrackStoragePath = (userId, artist, album) => {
  const userPath = getUserStoragePath(userId);
  const sanitizedArtist = sanitizeFilename(artist || 'Unknown Artist');
  const sanitizedAlbum = sanitizeFilename(album || 'Unknown Album');
  return path.join(userPath, sanitizedArtist, sanitizedAlbum);
};

/** Percorso per file condivisi (YouTube dedup globale) - relativo a storage root */
export const getSharedTrackPath = (videoId, filename) => {
  const basePath = getStoragePath();
  return path.join(basePath, 'shared', videoId, filename);
};

export const sanitizeFilename = (filename) => {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 255);
};

export const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
};

export const getFileStats = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
    };
  } catch (error) {
    return null;
  }
};

/**
 * Calcola lo spazio reale occupato su disco per un utente
 * Scansiona tutti i file nella directory dell'utente
 */
export const calculateRealDiskUsage = async (userId) => {
  try {
    const userPath = getUserStoragePath(userId);
    let totalSize = 0;
    let fileCount = 0;

    const scanDirectory = async (dirPath) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            try {
              const stats = await fs.stat(fullPath);
              totalSize += stats.size;
              fileCount++;
            } catch (err) {
              // Ignora errori su singoli file
              console.warn(`[Disk Usage] Errore lettura file ${fullPath}:`, err.message);
            }
          }
        }
      } catch (err) {
        // Se la directory non esiste, ritorna 0
        if (err.code !== 'ENOENT') {
          console.warn(`[Disk Usage] Errore scansione directory ${dirPath}:`, err.message);
        }
      }
    };

    await scanDirectory(userPath);
    
    return {
      totalBytes: totalSize,
      fileCount: fileCount,
    };
  } catch (error) {
    console.error('[Disk Usage] Errore calcolo spazio disco:', error.message);
    return {
      totalBytes: 0,
      fileCount: 0,
    };
  }
};

/**
 * Verifica se un file è duplicato controllando il file_path nel database
 * @param {number} userId - ID utente
 * @param {string} filePath - Percorso relativo del file (come salvato nel DB)
 * @returns {Promise<boolean>} - true se il file è duplicato
 */
export const isDuplicateFile = async (userId, filePath) => {
  try {
    const result = await pool.query(
      'SELECT id FROM tracks WHERE user_id = $1 AND file_path = $2',
      [userId, filePath]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('[Duplicate Check] Errore verifica duplicati:', error.message);
    // In caso di errore, ritorna false per non bloccare il processo
    return false;
  }
};


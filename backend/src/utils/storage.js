import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getStoragePath = () => {
  return process.env.STORAGE_PATH || path.join(__dirname, '../../storage');
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


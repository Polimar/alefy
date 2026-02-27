import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { AppError } from '../middleware/errorHandler.js';

const execAsync = promisify(exec);

/**
 * Risolve il percorso di yt-dlp.
 * Se YTDLP_PATH è assoluto e non esiste, fallback a 'which yt-dlp'.
 */
export const getYtdlpPath = async () => {
  let ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';

  if (ytdlpPath.startsWith('/')) {
    try {
      await fs.access(ytdlpPath);
      return ytdlpPath;
    } catch (error) {
      try {
        const { stdout } = await execAsync('which yt-dlp', { maxBuffer: 1024 });
        return stdout.trim();
      } catch (pathError) {
        throw new AppError('yt-dlp non è installato o non è nel PATH. Verifica l\'installazione.', 500);
      }
    }
  }

  try {
    const { stdout } = await execAsync(`which ${ytdlpPath}`, { maxBuffer: 1024 });
    return stdout.trim();
  } catch (error) {
    throw new AppError('yt-dlp non è installato o non è nel PATH. Verifica l\'installazione.', 500);
  }
};

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHAZAM_SCRIPT_PATH = path.join(__dirname, '../../../scripts/shazam_recognize.py');

/**
 * Riconosce un file audio usando ShazamIO (Python)
 * @param {string} audioFilePath - Percorso completo del file audio
 * @returns {Promise<Object>} Metadati riconosciuti
 */
export async function recognizeWithShazam(audioFilePath) {
  try {
    // Verifica che lo script esista
    const fs = await import('fs/promises');
    try {
      await fs.access(SHAZAM_SCRIPT_PATH);
    } catch (error) {
      throw new Error('Script Shazam non trovato. Assicurati che shazam_recognize.py esista.');
    }

    // Esegui lo script Python
    const { stdout, stderr } = await execAsync(
      `python3 "${SHAZAM_SCRIPT_PATH}" "${audioFilePath}"`,
      {
        timeout: 30000, // 30 secondi timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    );

    if (stderr && !stderr.includes('WARNING')) {
      console.warn('[Shazam] Stderr:', stderr);
    }

    const result = JSON.parse(stdout);

    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.success) {
      return null;
    }

    return {
      title: result.title || null,
      artist: result.artist || null,
      album: result.album || null,
      genre: result.genre || null,
      year: result.year || null,
      source: 'shazam',
    };
  } catch (error) {
    console.error('[Shazam] Errore nel riconoscimento:', error.message);
    
    // Se Python non è installato o ShazamIO non è disponibile
    if (error.message.includes('python3') || error.message.includes('shazamio')) {
      return null; // Fallback silenzioso
    }
    
    throw error;
  }
}

/**
 * Verifica se Shazam è disponibile
 * @returns {Promise<boolean>}
 */
export async function isShazamAvailable() {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Verifica Python
    await execAsync('python3 --version');
    
    // Verifica ShazamIO
    const { stdout } = await execAsync('python3 -c "import shazamio"');
    return true;
  } catch (error) {
    return false;
  }
}


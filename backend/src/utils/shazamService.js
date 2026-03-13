import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_ROOT = path.join(__dirname, '../..');

const SHAZAM_SCRIPT_PATHS = [
  process.env.ALEFY_HOME && path.join(process.env.ALEFY_HOME, 'scripts/shazam_recognize.py'),
  '/opt/alefy/scripts/shazam_recognize.py',
  path.join(BACKEND_ROOT, '../scripts/shazam_recognize.py'),
].filter(Boolean);

const SHAZAM_VENV_PATHS = [
  process.env.SHAZAM_VENV,
  process.env.ALEFY_HOME && path.join(process.env.ALEFY_HOME, 'shazam_venv', 'bin', 'python3'),
  path.join(BACKEND_ROOT, '..', 'shazam_venv', 'bin', 'python3'),
  '/opt/alefy/shazam_venv/bin/python3',
  '/home/alefy/shazam_venv/bin/python3',
].filter(Boolean);

/**
 * Riconosce un file audio usando ShazamIO (Python)
 * @param {string} audioFilePath - Percorso completo del file audio
 * @returns {Promise<Object>} Metadati riconosciuti
 */
export async function recognizeWithShazam(audioFilePath) {
  try {
    // Verifica che lo script esista (prova percorsi multipli)
    const fs = await import('fs/promises');
    let shazamScriptPath = null;
    for (const scriptPath of SHAZAM_SCRIPT_PATHS) {
      try {
        await fs.access(scriptPath);
        shazamScriptPath = scriptPath;
        break;
      } catch (e) {
        // Continua con il prossimo percorso
      }
    }
    
    if (!shazamScriptPath) {
      throw new Error('Script Shazam non trovato. Assicurati che shazam_recognize.py esista.');
    }

    let pythonCmd = 'python3';
    for (const venvPath of SHAZAM_VENV_PATHS) {
      try {
        await fs.access(venvPath);
        pythonCmd = venvPath;
        break;
      } catch {
        /* continua */
      }
    }

    // Esegui lo script Python
    const { stdout, stderr } = await execAsync(
      `${pythonCmd} "${shazamScriptPath}" "${audioFilePath}"`,
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
  const fs = await import('fs/promises');
  try {
    await execAsync('python3 --version');
  } catch (e) {
    console.warn('[Shazam] Python3 non trovato:', e.message);
    return false;
  }

  let pythonCmd = 'python3';
  for (const venvPath of SHAZAM_VENV_PATHS) {
    try {
      await fs.access(venvPath);
      pythonCmd = venvPath;
      break;
    } catch {
      /* continua */
    }
  }

  try {
    await execAsync(`${pythonCmd} -c "import shazamio"`);
    return true;
  } catch (error) {
    console.warn(
      '[Shazam] Verifica fallita. Python:', pythonCmd,
      '| Percorsi venv controllati:', SHAZAM_VENV_PATHS.join(', '),
      '| Errore:', error.message
    );
    return false;
  }
}


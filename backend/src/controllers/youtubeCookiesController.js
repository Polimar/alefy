import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { getStoragePath, ensureDirectoryExists } from '../utils/storage.js';
import { getYtdlpPath } from '../utils/ytdlp.js';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { z } from 'zod';

const updateCookiesSchema = z.object({
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

// Configurazione multer per upload file cookies
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const storagePath = getStoragePath();
    const cookiesDir = path.join(storagePath, 'youtube_cookies');
    await ensureDirectoryExists(cookiesDir);
    cb(null, cookiesDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `cookies-${timestamp}.txt`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max - il file viene filtrato per conservare solo cookies YouTube
  },
  fileFilter: (req, file, cb) => {
    // Accetta solo file .txt (formato Netscape cookies)
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new AppError('Solo file .txt sono supportati per i cookies', 400));
    }
  },
});

/**
 * Filtra solo i cookies di YouTube da un file cookies Netscape
 */
async function filterYouTubeCookies(inputPath) {
  try {
    const content = await fs.readFile(inputPath, 'utf8');
    const lines = content.split('\n');
    
    // Mantieni l'header del file
    const header = lines.filter(line => line.trim().startsWith('#'));
    
    // Filtra solo le righe che contengono cookies di YouTube o Google (necessari per YouTube)
    const youtubeDomains = ['.youtube.com', 'youtube.com', '.google.com', 'google.com', '.google.it', 'google.it'];
    const cookieLines = lines.filter(line => {
      if (line.trim().startsWith('#') || !line.trim()) {
        return false; // Skip header e righe vuote
      }
      
      // Formato Netscape: domain	flag	path	secure	expiration	name	value
      const parts = line.split('\t');
      if (parts.length >= 6) {
        const domain = parts[0].trim();
        return youtubeDomains.some(yd => domain === yd || domain.endsWith(yd));
      }
      return false;
    });
    
    // Se non ci sono cookies YouTube, usa tutto il file originale
    if (cookieLines.length === 0) {
      console.log('[YouTube Cookies] Nessun cookie YouTube trovato, uso file originale');
      return null; // Usa file originale
    }
    
    // Crea nuovo file filtrato
    const filteredContent = [...header, ...cookieLines].join('\n');
    const filteredPath = inputPath.replace('.txt', '-youtube-only.txt');
    await fs.writeFile(filteredPath, filteredContent, 'utf8');
    
    console.log(`[YouTube Cookies] Filtrati ${cookieLines.length} cookies YouTube da ${lines.length} righe totali`);
    
    // Elimina file originale e rinomina quello filtrato
    await fs.unlink(inputPath);
    await fs.rename(filteredPath, inputPath);
    
    return inputPath;
  } catch (error) {
    console.error('[YouTube Cookies] Errore filtraggio cookies:', error);
    // In caso di errore, usa il file originale
    return null;
  }
}

export const uploadCookies = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    if (!req.file) {
      throw new AppError('File cookies richiesto', 400);
    }

    // Filtra solo cookies YouTube se necessario
    await filterYouTubeCookies(req.file.path);

    const cookiesFilePath = path.relative(getStoragePath(), req.file.path);
    const description = req.body.description || null;

    // Disattiva tutti gli altri cookies attivi
    await pool.query(
      'UPDATE youtube_cookies SET is_active = false WHERE is_active = true'
    );

    // Salva nel database
    const result = await pool.query(
      `INSERT INTO youtube_cookies (cookies_file_path, uploaded_by, description, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, cookies_file_path, uploaded_at, description, is_active`,
      [cookiesFilePath, userId, description]
    );

    res.status(201).json({
      success: true,
      data: {
        cookies: result.rows[0],
      },
    });
  } catch (error) {
    // Elimina il file se c'è stato un errore
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Errore eliminazione file cookies:', unlinkError);
      }
    }
    next(error);
  }
};

export const getCookies = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT yc.*, u.username as uploaded_by_username
       FROM youtube_cookies yc
       LEFT JOIN users u ON yc.uploaded_by = u.id
       ORDER BY yc.uploaded_at DESC`
    );

    res.json({
      success: true,
      data: {
        cookies: result.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateCookies = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updateCookiesSchema.parse(req.body);

    // Verifica che il cookies esista
    const checkResult = await pool.query(
      'SELECT id FROM youtube_cookies WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      throw new AppError('Cookies non trovati', 404);
    }

    // Se si sta attivando questo cookies, disattiva gli altri
    if (validatedData.is_active === true) {
      await pool.query(
        'UPDATE youtube_cookies SET is_active = false WHERE id != $1',
        [id]
      );
    }

    // Aggiorna
    const updates = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(validatedData).forEach(key => {
      if (validatedData[key] !== undefined) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(validatedData[key]);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      throw new AppError('Nessun campo da aggiornare', 400);
    }

    values.push(id);
    const query = `UPDATE youtube_cookies SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: {
        cookies: result.rows[0],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(error.errors[0].message, 400));
    }
    next(error);
  }
};

export const deleteCookies = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Recupera il percorso del file
    const result = await pool.query(
      'SELECT cookies_file_path FROM youtube_cookies WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Cookies non trovati', 404);
    }

    const cookiesFilePath = path.join(getStoragePath(), result.rows[0].cookies_file_path);

    // Elimina dal database
    await pool.query('DELETE FROM youtube_cookies WHERE id = $1', [id]);

    // Elimina il file
    try {
      await fs.unlink(cookiesFilePath);
    } catch (unlinkError) {
      console.error('Errore eliminazione file cookies:', unlinkError);
      // Non fallire se il file non esiste
    }

    res.json({
      success: true,
      message: 'Cookies eliminati con successo',
    });
  } catch (error) {
    next(error);
  }
};

// Helper per ottenere il percorso del cookies attivo
export const getActiveCookiesPath = async () => {
  try {
    const result = await pool.query(
      'SELECT cookies_file_path FROM youtube_cookies WHERE is_active = true LIMIT 1'
    );

    if (result.rows.length > 0) {
      const cookiesFilePath = path.join(getStoragePath(), result.rows[0].cookies_file_path);
      // Verifica che il file esista
      try {
        await fs.access(cookiesFilePath);
        return cookiesFilePath;
      } catch (error) {
        console.error(`[YouTube Cookies] File cookies non trovato: ${cookiesFilePath}`);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('[YouTube Cookies] Errore recupero cookies attivi:', error);
    return null;
  }
};

// Test connessione YouTube con cookies
export const testCookies = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Recupera il percorso del file cookies
    const result = await pool.query(
      'SELECT cookies_file_path FROM youtube_cookies WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Cookies non trovati', 404);
    }

    const cookiesFilePath = path.join(getStoragePath(), result.rows[0].cookies_file_path);
    
    // Verifica che il file esista
    try {
      await fs.access(cookiesFilePath);
    } catch (error) {
      throw new AppError('File cookies non trovato', 404);
    }

    const ytdlpPath = await getYtdlpPath();

    // Esegui una ricerca di test semplice
    const testQuery = 'ytsearch1:test';
    const command = `${ytdlpPath} "${testQuery}" --dump-json --no-playlist --cookies "${cookiesFilePath}"`;
    
    console.log(`[YouTube Cookies Test] Test cookies ID ${id} con comando: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024, // 1MB
        timeout: 15000 // 15 secondi
      });

      // Se otteniamo un risultato JSON, i cookies funzionano
      if (stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          if (result.id && result.title) {
            return res.json({
              success: true,
              message: 'Cookies funzionanti! Test riuscito.',
              data: {
                testVideo: {
                  id: result.id,
                  title: result.title,
                },
              },
            });
          }
        } catch (parseError) {
          // Se non è JSON valido, potrebbe essere un errore
        }
      }

      // Se c'è stderr con errori di autenticazione, i cookies non funzionano
      if (stderr && (stderr.includes('Sign in') || stderr.includes('confirm'))) {
        return res.json({
          success: false,
          message: 'Cookies non validi o scaduti. YouTube richiede autenticazione.',
        });
      }

      return res.json({
        success: true,
        message: 'Test completato, ma risultato non chiaro. Verifica i log per dettagli.',
      });
    } catch (error) {
      const errorMessage = error.stderr || error.message || 'Errore sconosciuto';
      
      if (errorMessage.includes('Sign in') || errorMessage.includes('confirm')) {
        return res.json({
          success: false,
          message: 'Cookies non validi o scaduti. YouTube richiede autenticazione.',
        });
      }

      throw new AppError(`Errore durante il test: ${errorMessage.substring(0, 200)}`, 500);
    }
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    next(error);
  }
};


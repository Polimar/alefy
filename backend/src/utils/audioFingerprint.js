import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import { getStoragePath } from './storage.js';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Genera fingerprint audio usando chromaprint
 * @param {string} filePath - Percorso completo del file audio
 * @returns {Promise<string|null>} - Fingerprint string o null se errore
 */
export async function generateFingerprint(filePath) {
  try {
    // Verifica che il file esista
    await fs.access(filePath);
    
    // Cerca chromaprint nel sistema
    let chromaprintPath = 'fpcalc';
    
    // Prova a trovare chromaprint nel PATH
    try {
      const { stdout } = await execAsync('which fpcalc');
      chromaprintPath = stdout.trim();
    } catch (error) {
      // Se non trovato, prova con chromaprint direttamente
      try {
        const { stdout } = await execAsync('which chromaprint');
        chromaprintPath = stdout.trim();
      } catch (e) {
        console.warn('[Audio Fingerprint] chromaprint non trovato nel PATH, usando fpcalc');
      }
    }
    
    // Genera fingerprint con chromaprint
    // -length: durata massima da analizzare (30 secondi sono sufficienti)
    const { stdout } = await execAsync(`"${chromaprintPath}" -length 30 -raw "${filePath}"`, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 60000 // 60 secondi timeout
    });
    
    // Parse output: chromaprint restituisce "DURATION\tFINGERPRINT" su una riga
    const output = stdout.trim();
    const parts = output.split('\t');
    if (parts.length >= 2) {
      const duration = parseInt(parts[0].trim(), 10);
      const fingerprint = parts[1].trim();
      
      if (fingerprint && duration > 0) {
        return fingerprint;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[Audio Fingerprint] Errore generazione fingerprint:', error.message);
    return null;
  }
}

/**
 * Cerca su AcoustID usando fingerprint
 * @param {string} fingerprint - Fingerprint audio
 * @param {number} duration - Durata in secondi
 * @returns {Promise<Object|null>} - Risultato con recordingid e metadata o null
 */
export async function lookupAcoustID(fingerprint, duration) {
  try {
    const apiKey = process.env.ACOUSTID_API_KEY || null;
    
    // Costruisci URL AcoustID
    const params = new URLSearchParams({
      fingerprint: fingerprint,
      duration: duration.toString(),
      meta: 'recordings+releasegroups+releases+tracks', // Richiedi metadati completi
    });
    
    if (apiKey) {
      params.append('client', apiKey);
    } else {
      // Usa client ID pubblico (con rate limit più basso)
      params.append('client', 'alefy');
    }
    
    const url = `https://api.acoustid.org/v2/lookup?${params.toString()}`;
    
    const data = await new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'ALEFY/1.0.0 (https://github.com/Polimar/alefy)',
        },
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        });
      }).on('error', reject);
    });
    
    // Parse risultato AcoustID
    if (data.status === 'ok' && data.results && data.results.length > 0) {
      // Prendi il risultato con score più alto
      const bestResult = data.results.reduce((best, current) => 
        (current.score || 0) > (best.score || 0) ? current : best
      );
      
      if (bestResult.score > 0.5 && bestResult.recordings && bestResult.recordings.length > 0) {
        const recording = bestResult.recordings[0];
        
        return {
          acoustid: bestResult.id,
          recordingid: recording.id,
          score: bestResult.score,
          title: recording.title || null,
          artist: recording.artists?.[0]?.name || null,
          releases: recording.releases || [],
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('[AcoustID] Errore lookup:', error.message);
    return null;
  }
}

/**
 * Genera fingerprint e cerca su AcoustID
 * @param {string} filePath - Percorso completo del file audio
 * @returns {Promise<Object|null>} - Risultato AcoustID o null
 */
export async function identifyTrack(filePath) {
  try {
    // Genera fingerprint
    const fingerprint = await generateFingerprint(filePath);
    if (!fingerprint) {
      return null;
    }
    
    // Estrai durata dal fingerprint (primo valore)
    const durationMatch = fingerprint.match(/^(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1], 10) : 0;
    
    if (duration === 0) {
      return null;
    }
    
    // Cerca su AcoustID
    const result = await lookupAcoustID(fingerprint, duration);
    return result;
  } catch (error) {
    console.error('[Audio Fingerprint] Errore identificazione:', error.message);
    return null;
  }
}


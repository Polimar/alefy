import pool from '../database/db.js';
import { getStoragePath } from '../utils/storage.js';
import { identifyTrack } from '../utils/audioFingerprint.js';
import { searchTrackMetadataByRecordingId, searchTrackMetadata } from '../utils/metadataSearch.js';
import { recognizeWithShazam, isShazamAvailable } from '../utils/shazamService.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Determina se i metadati attuali sono di bassa qualità o mancanti
 * @param {Object} track - Traccia dal database
 * @returns {boolean}
 */
function needsMetadataUpdate(track) {
  const unknownPatterns = [
    /^unknown\s+artist$/i,
    /^artista\s+sconosciuto$/i,
    /^sconosciuto$/i,
    /^n\/a$/i,
    /^none$/i,
  ];
  
  const hasUnknownArtist = !track.artist || unknownPatterns.some(p => p.test(track.artist));
  const hasUnknownAlbum = !track.album || unknownPatterns.some(p => p.test(track.album));
  const missingGenre = !track.genre;
  const missingYear = !track.year;
  
  return hasUnknownArtist || hasUnknownAlbum || missingGenre || missingYear;
}

/**
 * Applica logica intelligente per aggiornare solo metadati migliori
 * @param {Object} current - Metadati attuali
 * @param {Object} newMetadata - Nuovi metadati trovati
 * @returns {Object} - Metadati da applicare
 */
function mergeMetadata(current, newMetadata) {
  const result = { ...current };
  
  // Aggiorna artista solo se quello attuale è "Unknown" o simile
  const unknownPatterns = [
    /^unknown\s+artist$/i,
    /^artista\s+sconosciuto$/i,
    /^sconosciuto$/i,
  ];
  
  if ((!current.artist || unknownPatterns.some(p => p.test(current.artist))) && newMetadata.artist) {
    result.artist = newMetadata.artist;
  }
  
  // Aggiorna album solo se quello attuale è "Unknown" o simile
  if ((!current.album || unknownPatterns.some(p => p.test(current.album))) && newMetadata.album) {
    result.album = newMetadata.album;
  }
  
  // Aggiorna genere solo se mancante
  if (!current.genre && newMetadata.genre) {
    result.genre = newMetadata.genre;
  }
  
  // Aggiorna anno solo se mancante
  if (!current.year && newMetadata.year) {
    result.year = newMetadata.year;
  }
  
  // Aggiorna album_artist se artista è stato aggiornato
  if (result.artist && (!current.album_artist || unknownPatterns.some(p => p.test(current.album_artist)))) {
    result.album_artist = newMetadata.album_artist || newMetadata.artist || result.artist;
  }
  
  return result;
}

/**
 * Processa una singola traccia per completare metadati
 * @param {number} trackId - ID della traccia
 * @returns {Promise<boolean>} - true se aggiornata, false altrimenti
 */
export async function processTrack(trackId) {
  try {
    // Recupera traccia dal database
    const trackResult = await pool.query(
      `SELECT id, user_id, title, artist, album, album_artist, genre, year, 
              track_number, disc_number, file_path, acoustid, metadata_source
       FROM tracks WHERE id = $1`,
      [trackId]
    );
    
    if (trackResult.rows.length === 0) {
      console.warn(`[Metadata Batch] Traccia ${trackId} non trovata`);
      return false;
    }
    
    const track = trackResult.rows[0];
    
    // Verifica se ha bisogno di aggiornamento
    if (!needsMetadataUpdate(track)) {
      console.log(`[Metadata Batch] Traccia ${trackId} ha già metadati completi`);
      // Marca come processata comunque
      await pool.query(
        'UPDATE tracks SET metadata_processed_at = CURRENT_TIMESTAMP WHERE id = $1',
        [trackId]
      );
      return false;
    }
    
    // Costruisci percorso file completo
    const storagePath = getStoragePath();
    const filePath = path.join(storagePath, track.file_path);
    
    // Verifica che il file esista
    try {
      await fs.access(filePath);
    } catch (error) {
      console.error(`[Metadata Batch] File non trovato per traccia ${trackId}: ${filePath}`);
      return false;
    }
    
    let metadataSource = 'manual';
    let acoustid = track.acoustid || null;
    let newMetadata = null;
    
    // Prova prima con fingerprint audio (se non già fatto)
    if (!track.acoustid) {
      console.log(`[Metadata Batch] Generazione fingerprint per traccia ${trackId}...`);
      const acoustidResult = await identifyTrack(filePath);
      
      if (acoustidResult && acoustidResult.recordingid) {
        acoustid = acoustidResult.acoustid;
        metadataSource = 'fingerprint';
        
        // Cerca metadati usando recordingid
        console.log(`[Metadata Batch] Ricerca metadati per recordingid ${acoustidResult.recordingid}...`);
        newMetadata = await searchTrackMetadataByRecordingId(acoustidResult.recordingid);
      }
    } else {
      // Se abbiamo già acoustid, usa recordingid per cercare metadati
      console.log(`[Metadata Batch] Traccia ${trackId} ha già acoustid, cercando metadati...`);
      // Dovremmo avere recordingid salvato, ma per ora usiamo ricerca normale
      metadataSource = 'fingerprint';
    }
    
    // Se fingerprint non ha funzionato, prova Shazam (se disponibile)
    if (!newMetadata) {
      const shazamAvailable = await isShazamAvailable();
      if (shazamAvailable) {
        try {
          console.log(`[Metadata Batch] Tentativo riconoscimento Shazam per traccia ${trackId}...`);
          const shazamMetadata = await recognizeWithShazam(filePath);
          if (shazamMetadata && shazamMetadata.title) {
            newMetadata = shazamMetadata;
            metadataSource = 'shazam';
            console.log(`[Metadata Batch] Shazam ha riconosciuto: ${shazamMetadata.artist} - ${shazamMetadata.title}`);
          }
        } catch (error) {
          console.warn(`[Metadata Batch] Shazam non disponibile o errore: ${error.message}`);
        }
      }
    }
    
    // Se ancora nessun risultato, prova ricerca normale
    if (!newMetadata && track.artist && track.title) {
      console.log(`[Metadata Batch] Ricerca metadati per "${track.artist}" - "${track.title}"...`);
      newMetadata = await searchTrackMetadata(track.artist, track.title, track.album);
      if (newMetadata) {
        metadataSource = metadataSource === 'manual' ? 'musicbrainz' : metadataSource;
      }
    }
    
    // searchTrackMetadata già include Last.fm come fallback, quindi non serve chiamarlo separatamente
    
    if (!newMetadata) {
      console.log(`[Metadata Batch] Nessun metadato trovato per traccia ${trackId}`);
      // Marca come processata comunque per evitare riprovare continuamente
      await pool.query(
        'UPDATE tracks SET metadata_processed_at = CURRENT_TIMESTAMP WHERE id = $1',
        [trackId]
      );
      return false;
    }
    
    // Applica logica intelligente per merge
    const mergedMetadata = mergeMetadata(track, newMetadata);
    
    // Aggiorna database solo se ci sono cambiamenti
    const hasChanges = 
      mergedMetadata.artist !== track.artist ||
      mergedMetadata.album !== track.album ||
      mergedMetadata.album_artist !== track.album_artist ||
      mergedMetadata.genre !== track.genre ||
      mergedMetadata.year !== track.year ||
      acoustid !== track.acoustid;
    
    if (hasChanges) {
      await pool.query(
        `UPDATE tracks SET
          artist = $1,
          album = $2,
          album_artist = $3,
          genre = $4,
          year = $5,
          acoustid = $6,
          metadata_source = $7,
          metadata_processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [
          mergedMetadata.artist,
          mergedMetadata.album,
          mergedMetadata.album_artist,
          mergedMetadata.genre,
          mergedMetadata.year,
          acoustid,
          metadataSource,
          trackId
        ]
      );
      
      console.log(`[Metadata Batch] Traccia ${trackId} aggiornata: ${track.artist || 'N/A'} -> ${mergedMetadata.artist || 'N/A'}`);
      return true;
    } else {
      console.log(`[Metadata Batch] Traccia ${trackId} non necessita aggiornamenti`);
      await pool.query(
        'UPDATE tracks SET metadata_processed_at = CURRENT_TIMESTAMP WHERE id = $1',
        [trackId]
      );
      return false;
    }
  } catch (error) {
    console.error(`[Metadata Batch] Errore processing traccia ${trackId}:`, error.message);
    return false;
  }
}

/**
 * Trova e processa tracce con metadati mancanti
 * @param {number} limit - Numero massimo di tracce da processare
 * @param {number} rateLimitMs - Delay tra richieste in millisecondi
 * @returns {Promise<Object>} - Statistiche processing
 */
export async function processMissingMetadata(limit = 10, rateLimitMs = 6000) {
  try {
    // Trova tracce con metadati mancanti o non processate
    const result = await pool.query(
      `SELECT id FROM tracks 
       WHERE metadata_processed_at IS NULL 
          OR (metadata_processed_at < NOW() - INTERVAL '7 days' AND (
            artist ILIKE '%unknown%' OR 
            artist ILIKE '%sconosciuto%' OR
            album ILIKE '%unknown%' OR
            album ILIKE '%sconosciuto%' OR
            genre IS NULL OR
            year IS NULL
          ))
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    
    const tracks = result.rows;
    console.log(`[Metadata Batch] Trovate ${tracks.length} tracce da processare`);
    
    let processed = 0;
    let updated = 0;
    let errors = 0;
    
    for (const track of tracks) {
      try {
        const wasUpdated = await processTrack(track.id);
        processed++;
        if (wasUpdated) {
          updated++;
        }
        
        // Rate limiting per evitare ban da API
        if (rateLimitMs > 0) {
          await new Promise(resolve => setTimeout(resolve, rateLimitMs));
        }
      } catch (error) {
        errors++;
        console.error(`[Metadata Batch] Errore processing traccia ${track.id}:`, error.message);
      }
    }
    
    return {
      total: tracks.length,
      processed,
      updated,
      errors
    };
  } catch (error) {
    console.error('[Metadata Batch] Errore processMissingMetadata:', error.message);
    throw error;
  }
}


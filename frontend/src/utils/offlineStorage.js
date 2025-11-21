/**
 * Utility per gestire lo storage offline delle tracce usando IndexedDB
 */

const DB_NAME = 'alefy_offline';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

let dbInstance = null;

/**
 * Apre la connessione al database IndexedDB
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Errore nell\'apertura del database'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Crea object store se non esiste
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'trackId' });
        objectStore.createIndex('playlistId', 'playlistId', { unique: false });
        objectStore.createIndex('downloadedAt', 'downloadedAt', { unique: false });
      }
    };
  });
}

/**
 * Salva una traccia offline
 * @param {number} trackId - ID della traccia
 * @param {Blob} audioBlob - Blob dell'audio
 * @param {Object} trackMetadata - Metadati della traccia
 * @param {number|null} playlistId - ID della playlist (opzionale)
 */
export async function saveTrackOffline(trackId, audioBlob, trackMetadata, playlistId = null) {
  try {
    // Converti Blob in ArrayBuffer per IndexedDB
    const arrayBuffer = await audioBlob.arrayBuffer();
    
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const trackData = {
      trackId,
      playlistId,
      audioData: arrayBuffer,
      audioType: audioBlob.type || 'audio/mpeg',
      metadata: trackMetadata,
      downloadedAt: new Date().toISOString(),
    };

    await new Promise((resolve, reject) => {
      const request = store.put(trackData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Errore nel salvataggio della traccia'));
    });

    console.log(`[Offline Storage] Traccia ${trackId} salvata offline`);
    return true;
  } catch (error) {
    console.error('[Offline Storage] Errore nel salvataggio:', error);
    throw error;
  }
}

/**
 * Recupera una traccia offline
 * @param {number} trackId - ID della traccia
 * @returns {Promise<{audioBlob: Blob, metadata: Object}|null>}
 */
export async function getTrackOffline(trackId) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(trackId);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Converti ArrayBuffer in Blob
          const audioBlob = new Blob([result.audioData], { type: result.audioType || 'audio/mpeg' });
          resolve({
            audioBlob,
            metadata: result.metadata,
          });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(new Error('Errore nel recupero della traccia'));
    });
  } catch (error) {
    console.error('[Offline Storage] Errore nel recupero:', error);
    return null;
  }
}

/**
 * Verifica se una traccia è disponibile offline
 * @param {number} trackId - ID della traccia
 * @returns {Promise<boolean>}
 */
export async function isTrackOffline(trackId) {
  try {
    const track = await getTrackOffline(trackId);
    return track !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Ottiene tutte le tracce offline per una playlist
 * @param {number} playlistId - ID della playlist
 * @returns {Promise<Array<{trackId: number, metadata: Object}>>}
 */
export async function getOfflineTracksForPlaylist(playlistId) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('playlistId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(playlistId);
      request.onsuccess = () => {
        const results = request.result.map(item => ({
          trackId: item.trackId,
          metadata: item.metadata,
        }));
        resolve(results);
      };
      request.onerror = () => reject(new Error('Errore nel recupero delle tracce'));
    });
  } catch (error) {
    console.error('[Offline Storage] Errore nel recupero delle tracce:', error);
    return [];
  }
}

/**
 * Rimuove una traccia offline
 * @param {number} trackId - ID della traccia
 */
export async function removeTrackOffline(trackId) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const request = store.delete(trackId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Errore nella rimozione della traccia'));
    });

    console.log(`[Offline Storage] Traccia ${trackId} rimossa offline`);
    return true;
  } catch (error) {
    console.error('[Offline Storage] Errore nella rimozione:', error);
    throw error;
  }
}

/**
 * Ottiene tutte le tracce offline
 * @returns {Promise<Array<{trackId: number, metadata: Object, playlistId: number|null}>>}
 */
export async function getAllOfflineTracks() {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result.map(item => ({
          trackId: item.trackId,
          metadata: item.metadata,
          playlistId: item.playlistId,
        }));
        resolve(results);
      };
      request.onerror = () => reject(new Error('Errore nel recupero delle tracce'));
    });
  } catch (error) {
    console.error('[Offline Storage] Errore nel recupero delle tracce:', error);
    return [];
  }
}

/**
 * Ottiene lo spazio utilizzato dalle tracce offline (approssimativo)
 * @returns {Promise<number>} Spazio in bytes
 */
export async function getOfflineStorageSize() {
  try {
    const tracks = await getAllOfflineTracks();
    // Stima: ogni traccia è circa 3-5MB, ma non possiamo calcolare esattamente senza accedere ai blob
    // Per ora restituiamo il numero di tracce
    return tracks.length;
  } catch (error) {
    return 0;
  }
}


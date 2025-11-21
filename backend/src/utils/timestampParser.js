/**
 * Parser per estrarre timestamp e titoli tracce dalla descrizione YouTube
 */

/**
 * Converte un timestamp in formato MM:SS o HH:MM:SS in secondi
 */
function timestampToSeconds(timestamp) {
  const parts = timestamp.split(':').map(Number);
  
  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return 0;
}

/**
 * Pulisce il titolo della traccia da caratteri indesiderati
 */
function cleanTrackTitle(title) {
  if (!title) return '';
  
  return title
    .trim()
    .replace(/^[-–—]\s*/, '') // Rimuovi trattini iniziali
    .replace(/\s*[-–—]\s*$/, '') // Rimuovi trattini finali
    .replace(/\s+/g, ' ') // Normalizza spazi multipli
    .trim();
}

/**
 * Estrae timestamp e titoli tracce dalla descrizione YouTube
 * Supporta vari formati:
 * - MM:SS Titolo
 * - MM:SS - Titolo
 * - (MM:SS) Titolo
 * - HH:MM:SS Titolo
 * 
 * @param {string} description - Descrizione completa del video YouTube
 * @param {number} totalDuration - Durata totale del video in secondi (opzionale, per calcolare endTime)
 * @returns {Array<{startTime: number, endTime: number|null, title: string}>}
 */
export function parseTimestampsFromDescription(description, totalDuration = null) {
  if (!description || typeof description !== 'string') {
    return [];
  }

  const tracks = [];
  
  // Pattern per trovare timestamp seguiti da titoli
  // Supporta: MM:SS, HH:MM:SS, con o senza parentesi, con trattini vari
  const timestampPattern = /(?:^|\n|\r|\t|\(|\[)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–—]?\s*([^\n\r\(\)\[\]]+?)(?=\s*(?:\d{1,2}:\d{2})|$|\(|\[|\n|\r)/g;
  
  let match;
  const foundTimestamps = [];
  
  while ((match = timestampPattern.exec(description)) !== null) {
    const hours = match[3] ? parseInt(match[1], 10) : 0;
    const minutes = match[3] ? parseInt(match[2], 10) : parseInt(match[1], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : parseInt(match[2], 10);
    
    const timestamp = match[3] 
      ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      : `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const title = cleanTrackTitle(match[4] || match[3] ? match[4] : match[2]);
    
    if (title && title.length > 0) {
      foundTimestamps.push({
        timestamp,
        startTime: timestampToSeconds(timestamp),
        title,
        index: match.index,
      });
    }
  }
  
  // Ordina per timestamp
  foundTimestamps.sort((a, b) => a.startTime - b.startTime);
  
  // Rimuovi duplicati (stesso timestamp)
  const uniqueTimestamps = [];
  const seenTimes = new Set();
  
  for (const ts of foundTimestamps) {
    if (!seenTimes.has(ts.startTime)) {
      seenTimes.add(ts.startTime);
      uniqueTimestamps.push(ts);
    }
  }
  
  // Crea array di tracce con startTime e endTime
  for (let i = 0; i < uniqueTimestamps.length; i++) {
    const current = uniqueTimestamps[i];
    const next = uniqueTimestamps[i + 1];
    
    const track = {
      startTime: current.startTime,
      endTime: next ? next.startTime : (totalDuration || null),
      title: current.title,
    };
    
    tracks.push(track);
  }
  
  return tracks;
}

/**
 * Verifica se la descrizione contiene timestamp (almeno 3)
 */
export function hasTimestamps(description) {
  const tracks = parseTimestampsFromDescription(description);
  return tracks.length >= 3;
}

/**
 * Verifica se la descrizione contiene pattern timestamp senza fare parsing completo
 * Usa regex semplice per rilevare presenza di timestamp (MM:SS o HH:MM:SS)
 * @param {string} description - Descrizione da verificare
 * @returns {boolean} - True se contiene almeno un pattern timestamp
 */
export function hasTimestampPattern(description) {
  if (!description || typeof description !== 'string') {
    return false;
  }
  
  // Pattern semplice per rilevare timestamp: MM:SS o HH:MM:SS
  // Cerca pattern come: (00:00), 00:00, 0:00, 00:00:00, ecc.
  const timestampPattern = /(?:^|\n|\r|\t|\(|\[)\s*\d{1,2}:\d{2}(?::\d{2})?\s*[-–—]?\s*[^\n\r\(\)\[\]]+/g;
  
  // Conta quanti match troviamo
  const matches = description.match(timestampPattern);
  return matches && matches.length > 0;
}


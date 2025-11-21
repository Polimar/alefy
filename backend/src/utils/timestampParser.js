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
    .replace(/^[-–—\u2013\u2014]\s*/, '') // Rimuovi trattini iniziali (ASCII e Unicode)
    .replace(/\s*[-–—\u2013\u2014]\s*$/, '') // Rimuovi trattini finali (ASCII e Unicode)
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
    console.log('[Timestamp Parser] Descrizione vuota o non valida');
    return [];
  }

  console.log(`[Timestamp Parser] Parsing descrizione (${description.length} caratteri), durata: ${totalDuration || 'null'}s`);
  console.log(`[Timestamp Parser] Prime 500 caratteri: ${description.substring(0, 500)}`);

  const tracks = [];
  
  // Pattern migliorato per trovare timestamp seguiti da titoli
  // Supporta vari formati:
  // - MM:SS Titolo
  // - MM:SS - Titolo
  // - MM:SS N. Titolo (es. "2:50 2. Dear Prudence")
  // - (MM:SS) Titolo
  // - [HH:MM:SS] - N. Titolo - Artista (es. "[00:00:00] - 01. Yesterday - The Beatles")
  // - HH:MM:SS Titolo
  // Pattern più flessibile che gestisce parentesi quadre, numeri di traccia, e artisti
  
  let match;
  const foundTimestamps = [];
  
  // Pattern 1: [HH:MM:SS] - N. Titolo - Artista (priorità alta)
  // Esempio: "[00:00:00] - 01. Yesterday - The Beatles"
  // Usa solo trattino ASCII per evitare problemi di encoding
  const bracketPattern = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?)\]\s*-\s*(\d+)\.?\s*([^-]+?)(?:\s*-\s*([^\n\r\[\]]+?))?(?=\s*\[|\s*\d{1,2}:\d{2}|$|\n|\r)/gi;
  
  let bracketMatches = 0;
  while ((match = bracketPattern.exec(description)) !== null) {
    bracketMatches++;
    const hours = match[3] ? parseInt(match[1], 10) : 0;
    const minutes = match[3] ? parseInt(match[2], 10) : parseInt(match[1], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : parseInt(match[2], 10);
    
    const startTime = hours * 3600 + minutes * 60 + seconds;
    
    // Estrai titolo (match[5]) e artista (match[6] se presente)
    let title = (match[5] || '').trim();
    const artist = (match[6] || '').trim();
    
    // Pulisci il titolo: rimuovi spazi extra e caratteri indesiderati
    title = cleanTrackTitle(title);
    
    if (title && title.length > 0) {
      foundTimestamps.push({
        timestamp: match[0],
        startTime,
        title,
        index: match.index,
      });
      console.log(`[Timestamp Parser] Trovato con pattern bracket: ${startTime}s - "${title}"`);
    }
  }
  
  console.log(`[Timestamp Parser] Pattern bracket trovati: ${bracketMatches}, tracce valide: ${foundTimestamps.length}`);
  
  // Pattern 2: Standard con parentesi o senza: (HH:MM:SS) o HH:MM:SS seguito da titolo
  // Solo se non abbiamo trovato nulla con le parentesi quadre
  if (foundTimestamps.length === 0) {
    console.log(`[Timestamp Parser] Nessun match con pattern bracket, provo pattern standard`);
    // Usa solo trattino ASCII per evitare problemi di encoding
    const timestampPattern = /(?:^|\n|\r|\t|\(|\[)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:-\s*(?:\d+\.?\s*)?)?([^\n\r\(\)\[\]]+?)(?=\s*(?:\d{1,2}:\d{2})|$|\(|\[|\n|\r)/g;
    
    while ((match = timestampPattern.exec(description)) !== null) {
      const hours = match[3] ? parseInt(match[1], 10) : 0;
      const minutes = match[3] ? parseInt(match[2], 10) : parseInt(match[1], 10);
      const seconds = match[3] ? parseInt(match[3], 10) : parseInt(match[2], 10);
      
      const startTime = hours * 3600 + minutes * 60 + seconds;
      
      // Pulisci il titolo: rimuovi numeri iniziali (es. "2. " o "2 ") e caratteri indesiderati
      let title = match[4] || '';
      // Rimuovi numeri seguiti da punto o spazio all'inizio (es. "2. " o "2 ")
      title = title.replace(/^\d+\.?\s*/, '');
      // Rimuovi anche eventuali artisti alla fine separati da trattino (solo se seguito da maiuscola)
      // Esempio: "Yesterday - The Beatles" -> "Yesterday"
      // Usa solo trattino ASCII per evitare problemi
      title = title.split(/\s*-\s*(?=[A-Z][a-z])/)[0];
      title = cleanTrackTitle(title);
      
      if (title && title.length > 0) {
        foundTimestamps.push({
          timestamp: match[0],
          startTime,
          title,
          index: match.index,
        });
        console.log(`[Timestamp Parser] Trovato con pattern standard: ${startTime}s - "${title}"`);
      }
    }
    console.log(`[Timestamp Parser] Pattern standard trovati: ${foundTimestamps.length} tracce totali`);
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
  
  console.log(`[Timestamp Parser] Risultato finale: ${tracks.length} tracce parse`);
  if (tracks.length > 0) {
    console.log(`[Timestamp Parser] Prime 3 tracce:`, tracks.slice(0, 3).map(t => `${t.startTime}s-${t.endTime || 'null'}s: ${t.title}`));
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
  // Usa solo trattino ASCII per evitare problemi di encoding
  const timestampPattern = /(?:^|\n|\r|\t|\(|\[)\s*\d{1,2}:\d{2}(?::\d{2})?\s*-?\s*[^\n\r\(\)\[\]]+/g;
  
  // Conta quanti match troviamo
  const matches = description.match(timestampPattern);
  return matches && matches.length > 0;
}


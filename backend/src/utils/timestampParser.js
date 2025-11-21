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
  // Supporta vari formati:
  // - "[00:00:00] - 01. Yesterday - The Beatles" (con trattino dopo timestamp)
  // - "[00:00:00] 01. Yesterday - The Beatles" (senza trattino dopo timestamp)
  // - "[00:02:03] 02. The Beatles - Don't Let Me Down" (formato invertito)
  // Usa solo trattino ASCII per evitare problemi di encoding
  // Migliorato per catturare meglio titolo e artista separatamente
  const bracketPattern = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(?:-\s*)?(\d+)\.?\s*([^-]+?)(?:\s*-\s*([^\n\r\[\]]+?))?(?=\s*\[|\s*\d{1,2}:\d{2}|$|\n|\r)/gi;
  
  let bracketMatches = 0;
  const rawTracks = []; // Memorizza tracce con artista per normalizzazione
  
  while ((match = bracketPattern.exec(description)) !== null) {
    bracketMatches++;
    const hours = match[3] ? parseInt(match[1], 10) : 0;
    const minutes = match[3] ? parseInt(match[2], 10) : parseInt(match[1], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : parseInt(match[2], 10);
    
    const startTime = hours * 3600 + minutes * 60 + seconds;
    
    // Estrai titolo (match[5]) e artista (match[6] se presente)
    let title = (match[5] || '').trim();
    let artist = (match[6] || '').trim();
    
    // Pulisci titolo e artista
    title = cleanTrackTitle(title);
    artist = cleanTrackTitle(artist);
    
    if (title && title.length > 0) {
      rawTracks.push({
        timestamp: match[0],
        startTime,
        title,
        artist,
        index: match.index,
      });
      console.log(`[Timestamp Parser] Trovato con pattern bracket: ${startTime}s - "${title}"${artist ? ` - "${artist}"` : ''}`);
    }
  }
  
  console.log(`[Timestamp Parser] Pattern bracket trovati: ${bracketMatches}, tracce valide: ${rawTracks.length}`);
  
  // Normalizzazione: gestisce casi dove titolo e artista sono invertiti
  // Esempio: prima riga "Yesterday - The Beatles", altre righe "The Beatles - Don't Let Me Down"
  if (rawTracks.length >= 2) {
    // Raggruppa tutte le parti dopo il numero di traccia (prima e seconda parte dopo trattino)
    const firstPartCounts = new Map(); // Parte prima del trattino finale
    const secondPartCounts = new Map(); // Parte dopo il trattino finale
    
    rawTracks.forEach(track => {
      const firstPart = track.title.toLowerCase().trim();
      const secondPart = track.artist.toLowerCase().trim();
      
      if (firstPart) {
        firstPartCounts.set(firstPart, (firstPartCounts.get(firstPart) || 0) + 1);
      }
      if (secondPart) {
        secondPartCounts.set(secondPart, (secondPartCounts.get(secondPart) || 0) + 1);
      }
    });
    
    // Trova quale parte appare più spesso come seconda parte (probabilmente l'artista)
    const mostCommonSecondPart = Array.from(secondPartCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    // Trova quale parte appare più spesso come prima parte
    const mostCommonFirstPart = Array.from(firstPartCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    // Se una parte appare sempre (o quasi sempre) come seconda parte, quella è l'artista
    const likelyArtist = mostCommonSecondPart && mostCommonSecondPart[1] >= rawTracks.length * 0.6 
      ? mostCommonSecondPart[0] 
      : null;
    
    // Se una parte appare sempre come prima parte e non come seconda, potrebbe essere l'artista invertito
    const likelyArtistInverted = mostCommonFirstPart && 
      mostCommonFirstPart[1] >= rawTracks.length * 0.6 &&
      (!mostCommonSecondPart || mostCommonSecondPart[0] !== mostCommonFirstPart[0] || mostCommonSecondPart[1] < mostCommonFirstPart[1])
      ? mostCommonFirstPart[0]
      : null;
    
    console.log(`[Timestamp Parser] Analisi ordine: artista probabile (seconda parte)="${likelyArtist}", artista probabile (prima parte)="${likelyArtistInverted}"`);
    
    // Normalizza le tracce
    for (const rawTrack of rawTracks) {
      const firstPart = rawTrack.title.toLowerCase().trim();
      const secondPart = rawTrack.artist.toLowerCase().trim();
      
      let finalTitle = rawTrack.title;
      let needsCorrection = false;
      
      // Caso 1: La seconda parte è l'artista comune (formato corretto: Titolo - Artista)
      if (likelyArtist && secondPart === likelyArtist && firstPart !== likelyArtist) {
        // Formato già corretto: prima parte è titolo, seconda parte è artista
        finalTitle = rawTrack.title;
        console.log(`[Timestamp Parser] Formato corretto per ${rawTrack.startTime}s: "${finalTitle}"`);
      }
      // Caso 2: La prima parte è l'artista comune (formato invertito: Artista - Titolo)
      else if (likelyArtistInverted && firstPart === likelyArtistInverted && secondPart !== likelyArtistInverted) {
        // Formato invertito: prima parte è artista, seconda parte è titolo
        finalTitle = rawTrack.artist;
        needsCorrection = true;
        console.log(`[Timestamp Parser] Formato invertito rilevato per ${rawTrack.startTime}s: "${rawTrack.title}" -> "${finalTitle}"`);
      }
      // Caso 3: La seconda parte è l'artista comune ma la prima parte è anche l'artista (caso ambiguo)
      else if (likelyArtist && secondPart === likelyArtist && firstPart === likelyArtist) {
        // Entrambe le parti sono uguali all'artista comune, cerca nella descrizione originale
        const contextStart = Math.max(0, rawTrack.index - 50);
        const contextEnd = Math.min(description.length, rawTrack.index + 300);
        const context = description.substring(contextStart, contextEnd);
        
        // Cerca pattern: numero traccia seguito da titolo prima del trattino finale
        const altPattern = new RegExp(`(\\d+)\\.?\\s+([^-]+?)\\s*-\\s*${likelyArtist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        const altMatch = context.match(altPattern);
        
        if (altMatch && altMatch[2]) {
          const altTitle = cleanTrackTitle(altMatch[2].trim());
          if (altTitle && altTitle.toLowerCase().trim() !== likelyArtist && altTitle.length > 0) {
            finalTitle = altTitle;
            needsCorrection = true;
            console.log(`[Timestamp Parser] Trovato titolo alternativo per ${rawTrack.startTime}s: "${finalTitle}"`);
          }
        }
      }
      // Caso 4: Nessun artista comune rilevato, ma abbiamo entrambe le parti
      else if (secondPart && firstPart && firstPart !== secondPart) {
        // Se la seconda parte appare più spesso come seconda parte, probabilmente è l'artista
        const secondPartFreq = secondPartCounts.get(secondPart) || 0;
        const firstPartFreq = firstPartCounts.get(firstPart) || 0;
        
        if (secondPartFreq > firstPartFreq && secondPartFreq >= rawTracks.length * 0.3) {
          // La seconda parte appare più spesso come seconda parte, probabilmente è l'artista
          finalTitle = rawTrack.title;
        } else if (firstPartFreq > secondPartFreq && firstPartFreq >= rawTracks.length * 0.3) {
          // La prima parte appare più spesso come prima parte, potrebbe essere invertito
          // Ma solo se la seconda parte non appare spesso come seconda parte
          if ((secondPartCounts.get(secondPart) || 0) < rawTracks.length * 0.3) {
            finalTitle = rawTrack.artist;
            needsCorrection = true;
            console.log(`[Timestamp Parser] Inversione rilevata per frequenza per ${rawTrack.startTime}s: "${rawTrack.title}" -> "${finalTitle}"`);
          } else {
            finalTitle = rawTrack.title;
          }
        } else {
          // Ambiguo, usa il titolo originale
          finalTitle = rawTrack.title;
        }
      }
      
      // Aggiungi la traccia normalizzata
      foundTimestamps.push({
        timestamp: rawTrack.timestamp,
        startTime: rawTrack.startTime,
        title: finalTitle,
        index: rawTrack.index,
      });
    }
  } else {
    // Meno di 2 tracce, usa i dati originali senza normalizzazione
    for (const rawTrack of rawTracks) {
      foundTimestamps.push({
        timestamp: rawTrack.timestamp,
        startTime: rawTrack.startTime,
        title: rawTrack.title,
        index: rawTrack.index,
      });
    }
  }
  
  console.log(`[Timestamp Parser] Tracce dopo normalizzazione: ${foundTimestamps.length}`);
  
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


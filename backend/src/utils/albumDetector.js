import { parseTimestampsFromDescription, hasTimestamps } from './timestampParser.js';

/**
 * Rileva se un video YouTube è un album completo
 * 
 * @param {number} duration - Durata del video in secondi
 * @param {string} description - Descrizione completa del video
 * @returns {{isAlbum: boolean, tracks: Array<{startTime: number, endTime: number|null, title: string}>}}
 */
export function detectAlbum(duration, description) {
  // Criteri per rilevare un album:
  // 1. Durata > 30 minuti (1800 secondi)
  // 2. Presenza di almeno 3 timestamp nella descrizione
  
  const isLongVideo = duration > 1800; // 30 minuti
  const hasMultipleTimestamps = hasTimestamps(description);
  
  const isAlbum = isLongVideo && hasMultipleTimestamps;
  
  let tracks = [];
  if (isAlbum && description) {
    tracks = parseTimestampsFromDescription(description, duration);
  }
  
  return {
    isAlbum,
    tracks,
  };
}


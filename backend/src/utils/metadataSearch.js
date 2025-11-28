import https from 'https';
import http from 'http';

/**
 * Cerca metadati di una traccia usando MusicBrainz API per recordingid
 * 
 * @param {string} recordingid - MusicBrainz recording ID
 * @returns {Promise<Object|null>}
 */
async function searchMusicBrainzByRecordingId(recordingid) {
  try {
    const url = `https://musicbrainz.org/ws/2/recording/${encodeURIComponent(recordingid)}?inc=artist-credits+releases+tags&fmt=json`;

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
            reject(e);
          }
        });
      }).on('error', reject);
    });

    if (data.id) {
      const recording = data;
      
      // Estrai informazioni utili
      const result = {
        title: recording.title || null,
        artist: recording['artist-credit']?.[0]?.name || null,
        album: recording.releases?.[0]?.title || null,
        year: recording.releases?.[0]?.date ? parseInt(recording.releases[0].date.substring(0, 4)) : null,
        genre: recording.tags?.[0]?.name || null,
        trackNumber: null, // Richiederebbe query aggiuntiva
      };

      return result;
    }

    return null;
  } catch (error) {
    console.error('[Metadata Search] Errore MusicBrainz per recordingid:', error.message);
    return null;
  }
}

/**
 * Cerca metadati di una traccia usando MusicBrainz API
 * 
 * @param {string} artist - Nome dell'artista
 * @param {string} title - Titolo della traccia
 * @param {string} album - Nome dell'album (opzionale)
 * @returns {Promise<Object|null>}
 */
async function searchMusicBrainz(artist, title, album = null) {
  try {
    // Prova prima con query completa (artista + titolo + album)
    let queries = [];
    
    if (album) {
      queries.push(`artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}" AND release:"${encodeURIComponent(album)}"`);
    }
    
    // Fallback: solo artista + titolo
    queries.push(`artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}"`);
    
    // Fallback: solo titolo (per casi con artista sconosciuto)
    if (artist && !artist.match(/unknown|sconosciuto/i)) {
      queries.push(`recording:"${encodeURIComponent(title)}"`);
    }

    for (const query of queries) {
      try {
        const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5&inc=releases+tags+artist-credits`;

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
                reject(e);
              }
            });
          }).on('error', reject);
        });

        if (data.recordings && data.recordings.length > 0) {
          // Trova il miglior match
          let bestMatch = null;
          let bestScore = 0;

          for (const recording of data.recordings) {
            let score = 0;
            const recArtist = recording['artist-credit']?.[0]?.name || '';
            const recTitle = recording.title || '';
            
            // Matching artista (case-insensitive)
            if (artist && recArtist.toLowerCase().includes(artist.toLowerCase())) {
              score += 3;
            } else if (artist && artist.toLowerCase().includes(recArtist.toLowerCase())) {
              score += 2;
            }
            
            // Matching titolo (case-insensitive)
            if (title && recTitle.toLowerCase().includes(title.toLowerCase())) {
              score += 3;
            } else if (title && title.toLowerCase().includes(recTitle.toLowerCase())) {
              score += 2;
            }
            
            // Matching album
            if (album) {
              const recAlbum = recording.releases?.[0]?.title || '';
              if (recAlbum && recAlbum.toLowerCase().includes(album.toLowerCase())) {
                score += 2;
              }
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = recording;
            }
          }

          if (bestMatch && bestScore >= 3) {
            const recording = bestMatch;
            
            // Estrai informazioni più complete
            const releases = recording.releases || [];
            const bestRelease = releases.find(r => r.date) || releases[0] || null;
            
            // Estrai tags/genre
            const tags = recording.tags || [];
            const genre = tags.length > 0 ? tags[0].name : null;
            
            // Estrai album_artist se disponibile
            const albumArtist = bestRelease?.['artist-credit']?.[0]?.name || recording['artist-credit']?.[0]?.name || null;
            
            const result = {
              title: recording.title || title,
              artist: recording['artist-credit']?.[0]?.name || artist,
              album: bestRelease?.title || album || null,
              album_artist: albumArtist,
              year: bestRelease?.date ? parseInt(bestRelease.date.substring(0, 4)) : null,
              genre: genre,
              trackNumber: null, // Richiederebbe query aggiuntiva per release specifica
            };

            return result;
          }
        }
      } catch (queryError) {
        // Continua con il prossimo query
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('[Metadata Search] Errore MusicBrainz:', error.message);
    return null;
  }
}

/**
 * Cerca metadati di una traccia usando Last.fm API come fallback
 * 
 * @param {string} artist - Nome dell'artista
 * @param {string} title - Titolo della traccia
 * @returns {Promise<Object|null>}
 */
async function searchLastFM(artist, title) {
  try {
    const apiKey = process.env.LASTFM_API_KEY || null;
    if (!apiKey) {
      return null; // Last.fm richiede API key
    }

    const url = `http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${apiKey}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json&autocorrect=1`;

    const data = await new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    if (data.track && data.track.name) {
      // Estrai informazioni più complete
      const track = data.track;
      
      // Estrai genere dai top tags
      const topTags = track.toptags?.tag || [];
      const genre = topTags.length > 0 ? topTags[0].name : null;
      
      // Estrai anno da wiki o album
      let year = null;
      if (track.album?.wiki?.published) {
        year = parseInt(track.album.wiki.published.substring(0, 4));
      } else if (track.album?.wiki?.content) {
        // Prova a estrarre anno dal contenuto wiki
        const yearMatch = track.album.wiki.content.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[0]);
        }
      }
      
      // Estrai album_artist se disponibile
      const albumArtist = track.album?.artist || track.artist?.name || null;
      
      return {
        title: track.name || title,
        artist: track.artist?.name || artist,
        album: track.album?.title || null,
        album_artist: albumArtist,
        year: year,
        genre: genre,
        trackNumber: track.album?.['@attr']?.position ? parseInt(track.album['@attr'].position) : null,
      };
    }

    return null;
  } catch (error) {
    console.error('[Metadata Search] Errore Last.fm:', error.message);
    return null;
  }
}

/**
 * Cerca metadati usando recordingid da AcoustID
 * 
 * @param {string} recordingid - MusicBrainz recording ID
 * @returns {Promise<Object|null>}
 */
export async function searchTrackMetadataByRecordingId(recordingid) {
  if (!recordingid) {
    return null;
  }

  // Cerca su MusicBrainz usando recordingid
  let metadata = await searchMusicBrainzByRecordingId(recordingid);
  
  if (!metadata) {
    return null;
  }

  // Se MusicBrainz non ha genere, prova Last.fm
  if (!metadata.genre && metadata.artist && metadata.title) {
    const lastfmMetadata = await searchLastFM(metadata.artist, metadata.title);
    if (lastfmMetadata && lastfmMetadata.genre) {
      metadata.genre = lastfmMetadata.genre;
    }
  }

  return metadata;
}

/**
 * Cerca metadati per una traccia usando MusicBrainz e Last.fm come fallback
 * 
 * @param {string} artist - Nome dell'artista
 * @param {string} title - Titolo della traccia
 * @param {string} album - Nome dell'album (opzionale)
 * @returns {Promise<Object|null>}
 */
export async function searchTrackMetadata(artist, title, album = null) {
  if (!artist || !title) {
    return null;
  }

  // Prova prima MusicBrainz (più completo)
  let metadata = await searchMusicBrainz(artist, title, album);
  
  // Se MusicBrainz non ha genere o anno, integra con Last.fm
  if (metadata) {
    const lastfmMetadata = await searchLastFM(metadata.artist || artist, metadata.title || title);
    
    // Merge informazioni mancanti da Last.fm
    if (lastfmMetadata) {
      if (!metadata.genre && lastfmMetadata.genre) {
        metadata.genre = lastfmMetadata.genre;
      }
      if (!metadata.year && lastfmMetadata.year) {
        metadata.year = lastfmMetadata.year;
      }
      if (!metadata.album && lastfmMetadata.album) {
        metadata.album = lastfmMetadata.album;
      }
      if (!metadata.album_artist && lastfmMetadata.album_artist) {
        metadata.album_artist = lastfmMetadata.album_artist;
      }
    }
  } else {
    // Se MusicBrainz fallisce completamente, prova Last.fm
    metadata = await searchLastFM(artist, title);
  }

  // Se entrambi falliscono, ritorna metadati base
  if (!metadata) {
    return {
      title: title,
      artist: artist,
      album: album || null,
      album_artist: artist,
      year: null,
      genre: null,
      trackNumber: null,
    };
  }

  // Assicurati che album_artist sia sempre presente
  if (!metadata.album_artist && metadata.artist) {
    metadata.album_artist = metadata.artist;
  }

  return metadata;
}

/**
 * Cerca metadati per un intero album
 * 
 * @param {string} artist - Nome dell'artista
 * @param {string} album - Nome dell'album
 * @returns {Promise<Array<Object>|null>}
 */
export async function searchAlbumMetadata(artist, album) {
  // Per ora ritorna null, può essere implementato in futuro
  // usando MusicBrainz release API
  return null;
}


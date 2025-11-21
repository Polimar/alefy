import https from 'https';
import http from 'http';

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
    // Costruisci query per MusicBrainz
    let query = `artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}"`;
    if (album) {
      query += ` AND release:"${encodeURIComponent(album)}"`;
    }

    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;

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
      const recording = data.recordings[0];
      
      // Estrai informazioni utili
      const result = {
        title: recording.title || title,
        artist: recording['artist-credit']?.[0]?.name || artist,
        album: recording.releases?.[0]?.title || album,
        year: recording.releases?.[0]?.date ? parseInt(recording.releases[0].date.substring(0, 4)) : null,
        genre: null, // MusicBrainz non fornisce genere direttamente
        trackNumber: recording.releases?.[0]?.['media']?.[0]?.['track-list']?.findIndex(t => t.id === recording.id) + 1 || null,
      };

      return result;
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

    const url = `http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${apiKey}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`;

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
      return {
        title: data.track.name || title,
        artist: data.track.artist?.name || artist,
        album: data.track.album?.title || null,
        year: data.track.album?.wiki?.published ? parseInt(data.track.album.wiki.published.substring(0, 4)) : null,
        genre: data.track.toptags?.tag?.[0]?.name || null,
        trackNumber: null,
      };
    }

    return null;
  } catch (error) {
    console.error('[Metadata Search] Errore Last.fm:', error.message);
    return null;
  }
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

  // Prova prima MusicBrainz
  let metadata = await searchMusicBrainz(artist, title, album);
  
  // Se MusicBrainz fallisce, prova Last.fm
  if (!metadata) {
    metadata = await searchLastFM(artist, title);
  }

  // Se entrambi falliscono, ritorna metadati base
  if (!metadata) {
    return {
      title: title,
      artist: artist,
      album: album || null,
      year: null,
      genre: null,
      trackNumber: null,
    };
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


import { parseFile } from 'music-metadata';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const extractMetadata = async (filePath) => {
  try {
    // Usa skipCovers per evitare di caricare immagini in memoria se non necessario
    // e skipPostHeaders per ridurre l'uso di memoria
    const metadata = await parseFile(filePath, {
      skipCovers: false, // Serve per salvare cover art
      duration: true,
      skipPostHeaders: true, // Salta header alla fine del file per risparmiare memoria
    });
    
    const common = metadata.common || {};
    const format = metadata.format || {};
    
    return {
      title: common.title || path.basename(filePath, path.extname(filePath)),
      artist: common.artist || 'Unknown Artist',
      album: common.album || 'Unknown Album',
      albumArtist: common.albumartist || common.artist || 'Unknown Artist',
      genre: common.genre && common.genre.length > 0 ? common.genre[0] : null,
      year: common.year || null,
      trackNumber: common.track?.no || null,
      discNumber: common.disk?.no || null,
      duration: Math.floor(format.duration || 0),
      bitrate: format.bitrate || null,
      sampleRate: format.sampleRate || null,
      picture: common.picture && common.picture.length > 0 ? common.picture[0] : null,
    };
  } catch (error) {
    console.error('Error extracting metadata:', error);
    // Return minimal metadata if extraction fails
    return {
      title: path.basename(filePath, path.extname(filePath)),
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      albumArtist: 'Unknown Artist',
      genre: null,
      year: null,
      trackNumber: null,
      discNumber: null,
      duration: 0,
      bitrate: null,
      sampleRate: null,
      picture: null,
    };
  }
};

export const saveCoverArt = async (picture, userId, album, storagePath) => {
  if (!picture) return null;

  try {
    const coverDir = path.join(storagePath, 'covers', userId.toString());
    await fs.mkdir(coverDir, { recursive: true });

    const extension = picture.format === 'image/jpeg' ? 'jpg' : 
                     picture.format === 'image/png' ? 'png' : 'jpg';
    const filename = `${album || 'unknown'}-${Date.now()}.${extension}`;
    const filepath = path.join(coverDir, filename);

    await fs.writeFile(filepath, picture.data);

    return path.relative(storagePath, filepath);
  } catch (error) {
    console.error('Error saving cover art:', error);
    return null;
  }
};

/**
 * Scarica una thumbnail da un URL e la salva come cover art
 */
export const downloadThumbnail = async (thumbnailUrl, userId, trackTitle, storagePath) => {
  if (!thumbnailUrl) return null;

  try {
    console.log(`[Thumbnail Download] Download da: ${thumbnailUrl}`);
    
    const coverDir = path.join(storagePath, 'covers', userId.toString());
    await fs.mkdir(coverDir, { recursive: true });

    // Determina il protocollo (http o https)
    const url = new URL(thumbnailUrl);
    const client = url.protocol === 'https:' ? https : http;

    // Download della thumbnail
    const imageData = await new Promise((resolve, reject) => {
      const request = client.get(thumbnailUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      });

      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Timeout durante il download della thumbnail'));
      });
    });

    // Determina l'estensione dal Content-Type o dall'URL
    let extension = 'jpg';
    if (thumbnailUrl.includes('.png')) {
      extension = 'png';
    } else if (thumbnailUrl.includes('.webp')) {
      extension = 'webp';
    }

    // Crea un nome file sicuro dal titolo del track
    const safeTitle = (trackTitle || 'unknown')
      .replace(/[^a-z0-9]/gi, '-')
      .substring(0, 50)
      .toLowerCase();
    
    const filename = `${safeTitle}-${Date.now()}.${extension}`;
    const filepath = path.join(coverDir, filename);

    await fs.writeFile(filepath, imageData);
    console.log(`[Thumbnail Download] Salvata in: ${filepath}`);

    return path.relative(storagePath, filepath);
  } catch (error) {
    console.error('[Thumbnail Download] Errore:', error.message);
    return null;
  }
};


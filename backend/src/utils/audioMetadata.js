import { parseFile } from 'music-metadata';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const extractMetadata = async (filePath) => {
  try {
    const metadata = await parseFile(filePath);
    
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


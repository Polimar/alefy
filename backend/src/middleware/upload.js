import multer from 'multer';
import path from 'path';
import { AppError } from './errorHandler.js';
import { getStoragePath, sanitizeFilename, ensureDirectoryExists } from '../utils/storage.js';

const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/flac',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
];

const ALLOWED_EXTENSIONS = ['.mp3', '.ogg', '.flac', '.wav', '.m4a', '.aac'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(`Formato file non supportato. Formati supportati: ${ALLOWED_EXTENSIONS.join(', ')}`, 400), false);
  }
};

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const storagePath = getStoragePath();
      const tempDir = path.join(storagePath, 'temp');
      await ensureDirectoryExists(tempDir);
      cb(null, tempDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const sanitized = sanitizeFilename(path.basename(file.originalname, ext));
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${sanitized}-${uniqueSuffix}${ext}`);
  },
});

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

export const uploadMultiple = upload.array('files', 50); // Max 50 files at once


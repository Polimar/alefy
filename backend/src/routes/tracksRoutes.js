import express from 'express';
import multer from 'multer';
import {
  getTracks,
  getTrack,
  updateTrack,
  deleteTrack,
  getArtists,
  getAlbums,
  getGenres,
} from '../controllers/tracksController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for cover art upload
const upload = multer({
  dest: '/tmp/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo file non supportato. Usa JPEG, PNG, WebP o GIF.'));
    }
  },
});

router.get('/', authenticate, getTracks);
router.get('/artists', authenticate, getArtists);
router.get('/albums', authenticate, getAlbums);
router.get('/genres', authenticate, getGenres);
router.get('/:id', authenticate, getTrack);
router.put('/:id', authenticate, upload.single('cover_art'), updateTrack);
router.patch('/:id', authenticate, upload.single('cover_art'), updateTrack);
router.delete('/:id', authenticate, deleteTrack);

export default router;


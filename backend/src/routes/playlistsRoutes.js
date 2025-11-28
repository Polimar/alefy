import express from 'express';
import multer from 'multer';
import {
  getPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTrack,
  removeTrack,
  reorderTracks,
  getPublicPlaylists,
} from '../controllers/playlistsController.js';
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

router.get('/', authenticate, getPlaylists);
router.get('/public', authenticate, getPublicPlaylists);
router.get('/:id', authenticate, getPlaylist);
router.post('/', authenticate, createPlaylist);
router.put('/:id', authenticate, upload.single('cover_art'), updatePlaylist);
router.patch('/:id', authenticate, upload.single('cover_art'), updatePlaylist);
router.delete('/:id', authenticate, deletePlaylist);
router.post('/:id/tracks', authenticate, addTrack);
router.delete('/:id/tracks/:trackId', authenticate, removeTrack);
router.put('/:id/reorder', authenticate, reorderTracks);

export default router;


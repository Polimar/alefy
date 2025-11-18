import express from 'express';
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

router.get('/', authenticate, getTracks);
router.get('/artists', authenticate, getArtists);
router.get('/albums', authenticate, getAlbums);
router.get('/genres', authenticate, getGenres);
router.get('/:id', authenticate, getTrack);
router.put('/:id', authenticate, updateTrack);
router.delete('/:id', authenticate, deleteTrack);

export default router;


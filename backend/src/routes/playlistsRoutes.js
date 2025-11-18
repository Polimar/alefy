import express from 'express';
import {
  getPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTrack,
  removeTrack,
  reorderTracks,
} from '../controllers/playlistsController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getPlaylists);
router.get('/:id', authenticate, getPlaylist);
router.post('/', authenticate, createPlaylist);
router.put('/:id', authenticate, updatePlaylist);
router.delete('/:id', authenticate, deletePlaylist);
router.post('/:id/tracks', authenticate, addTrack);
router.delete('/:id/tracks/:trackId', authenticate, removeTrack);
router.put('/:id/reorder', authenticate, reorderTracks);

export default router;


import express from 'express';
import { streamTrack, getCoverArt } from '../controllers/streamController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/tracks/:id', authenticate, streamTrack);
router.get('/tracks/:id/cover', authenticate, getCoverArt);

export default router;


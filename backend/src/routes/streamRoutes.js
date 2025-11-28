import express from 'express';
import { streamTrack, getCoverArt } from '../controllers/streamController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Route per streaming: autenticazione opzionale (può usare token guest o JWT)
router.get('/tracks/:id', optionalAuth, streamTrack);
router.get('/tracks/:id/cover', optionalAuth, getCoverArt);

export default router;


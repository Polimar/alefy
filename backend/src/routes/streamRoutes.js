import express from 'express';
import { streamTrack, getCoverArt } from '../controllers/streamController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Route per streaming: autenticazione opzionale (può usare token guest)
router.get('/tracks/:id', streamTrack);
router.get('/tracks/:id/cover', getCoverArt);

export default router;


import express from 'express';
import { downloadYouTube, searchYouTube } from '../controllers/youtubeController.js';
import { authenticate } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Stricter rate limiting for YouTube downloads
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 downloads per hour
  message: 'Troppi download da YouTube, riprova più tardi.',
});

// More permissive rate limiting for searches
const searchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 searches per hour
  message: 'Troppe ricerche su YouTube, riprova più tardi.',
});

router.post(
  '/download',
  authenticate,
  downloadLimiter,
  downloadYouTube
);

router.get(
  '/search',
  authenticate,
  searchLimiter,
  searchYouTube
);

export default router;


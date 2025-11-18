import express from 'express';
import { downloadYouTube } from '../controllers/youtubeController.js';
import { authenticate } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Stricter rate limiting for YouTube downloads
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 downloads per hour
  message: 'Troppi download da YouTube, riprova più tardi.',
});

router.post(
  '/download',
  authenticate,
  downloadLimiter,
  downloadYouTube
);

export default router;


import express from 'express';
import { downloadYouTube, searchYouTube, getYouTubePlaylist, getQueue, cancelJob, pauseJob, resumeJob, splitTrack, parseTimestampsFromVideo } from '../controllers/youtubeController.js';
import { authenticate } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Stricter rate limiting for YouTube downloads (configurable via YOUTUBE_DOWNLOAD_RATE_LIMIT, default 30/hour)
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.YOUTUBE_DOWNLOAD_RATE_LIMIT, 10) || 100,
  message: 'Troppi download da YouTube, riprova più tardi.',
  standardHeaders: true, // Sends RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset for frontend popup
  legacyHeaders: false,
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

router.get(
  '/playlist',
  authenticate,
  searchLimiter,
  getYouTubePlaylist
);

router.get(
  '/queue',
  authenticate,
  getQueue
);

router.delete(
  '/queue/:jobId',
  authenticate,
  cancelJob
);

router.post(
  '/queue/:jobId/pause',
  authenticate,
  pauseJob
);

router.post(
  '/queue/:jobId/resume',
  authenticate,
  resumeJob
);

router.post(
  '/split/:trackId',
  authenticate,
  downloadLimiter,
  splitTrack
);

router.post(
  '/parse-timestamps',
  authenticate,
  searchLimiter,
  parseTimestampsFromVideo
);

export default router;


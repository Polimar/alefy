import express from 'express';
import { uploadTracks } from '../controllers/uploadController.js';
import { authenticate } from '../middleware/auth.js';
import { uploadMultiple } from '../middleware/upload.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Stricter rate limiting for uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 upload requests per hour
  message: 'Troppi upload, riprova più tardi.',
});

router.post(
  '/tracks',
  authenticate,
  uploadLimiter,
  uploadMultiple,
  uploadTracks
);

export default router;


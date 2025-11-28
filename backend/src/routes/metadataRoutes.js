import express from 'express';
import {
  processSingleTrack,
  processAllTracks,
  getTrackStatus,
  recognizeWithShazamController,
  getMetadataStats,
} from '../controllers/metadataController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/process/:trackId', authenticate, processSingleTrack);
router.post('/process-all', authenticate, processAllTracks);
router.post('/shazam/:trackId', authenticate, recognizeWithShazamController);
router.get('/status/:trackId', authenticate, getTrackStatus);
router.get('/stats', authenticate, getMetadataStats);

export default router;



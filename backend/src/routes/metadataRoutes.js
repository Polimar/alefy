import express from 'express';
import {
  processSingleTrack,
  processAllTracks,
  getTrackStatus,
} from '../controllers/metadataController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/process/:trackId', authenticate, processSingleTrack);
router.post('/process-all', authenticate, processAllTracks);
router.get('/status/:trackId', authenticate, getTrackStatus);

export default router;


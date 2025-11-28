import express from 'express';
import {
  generateShareToken,
  getSharedResource,
} from '../controllers/shareController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Endpoint pubblico per ottenere risorsa condivisa
router.get('/:token', getSharedResource);

// Endpoint autenticati per generare token
router.post('/track/:id', authenticate, generateShareToken);
router.post('/playlist/:id', authenticate, generateShareToken);

export default router;


import express from 'express';
import {
  uploadCookies,
  getCookies,
  updateCookies,
  deleteCookies,
  testCookies,
  upload,
} from '../controllers/youtubeCookiesController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Tutte le routes richiedono autenticazione e privilegi admin
router.post(
  '/upload',
  authenticate,
  requireAdmin,
  (req, res, next) => {
    upload.single('cookies')(req, res, (err) => {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: { message: 'File troppo grande. Limite 10MB.' },
        });
      }
      if (err) return next(err);
      next();
    });
  },
  uploadCookies
);

router.get(
  '/',
  authenticate,
  requireAdmin,
  getCookies
);

router.put(
  '/:id',
  authenticate,
  requireAdmin,
  updateCookies
);

router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  deleteCookies
);

router.post(
  '/:id/test',
  authenticate,
  requireAdmin,
  testCookies
);

export default router;


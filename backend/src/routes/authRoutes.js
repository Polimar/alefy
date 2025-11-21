import express from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, refresh, logout, me } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Rate limiting per autenticazione (più permissivo)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 20, // 20 tentativi ogni 15 minuti
  message: 'Troppi tentativi di login, riprova più tardi.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Non conta le richieste riuscite
});

// Rate limiting molto permissivo per /me (chiamato spesso all'avvio)
const meLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 100, // 100 chiamate ogni 15 minuti (molto permissivo)
  message: 'Troppe richieste, riprova più tardi.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', meLimiter, authenticate, me);

export default router;


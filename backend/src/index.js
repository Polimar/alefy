import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import pool from './database/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Compression
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Rate limiting più permissivo per GET (richieste di lettura)
const getLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 2000, // 2000 richieste GET ogni 15 minuti (aumentato per evitare 429)
  message: 'Troppe richieste da questo IP, riprova più tardi.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// Rate limiting per POST/PUT/DELETE (più restrittivo)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 500, // 500 richieste di scrittura ogni 15 minuti (aumentato)
  message: 'Troppe richieste da questo IP, riprova più tardi.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Applica rate limiting differenziato per metodo HTTP
app.use('/api/', (req, res, next) => {
  // Skip rate limiting per route di autenticazione (hanno il loro rate limiter nelle route)
  if (req.path === '/auth/login' || 
      req.path === '/auth/register' || 
      req.path === '/auth/me' ||
      req.path === '/auth/refresh') {
    return next();
  }
  
  // Applica rate limiting basato sul metodo HTTP
  if (req.method === 'GET') {
    getLimiter(req, res, next);
  } else {
    writeLimiter(req, res, next);
  }
});

// Disabilita cache per tutte le risposte API
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// API routes
import authRoutes from './routes/authRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import streamRoutes from './routes/streamRoutes.js';
import tracksRoutes from './routes/tracksRoutes.js';
import playlistsRoutes from './routes/playlistsRoutes.js';
import youtubeRoutes from './routes/youtubeRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import usersRoutes from './routes/usersRoutes.js';
import downloadQueue from './utils/downloadQueue.js';
import { processDownloadJob } from './controllers/youtubeController.js';

// Registra listener per processare job dalla coda
downloadQueue.on('job-ready', async (job) => {
  await processDownloadJob(job);
});

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/tracks', tracksRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/users', usersRoutes);

app.get('/api', (req, res) => {
  res.json({ 
    message: 'ALEFY API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      tracks: '/api/tracks',
      playlists: '/api/playlists',
    }
  });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Endpoint non trovato',
    },
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server avviato sulla porta ${PORT}`);
  logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM ricevuto, chiusura server...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT ricevuto, chiusura server...');
  await pool.end();
  process.exit(0);
});


import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import pool from './database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Verifica variabili ambiente critiche
const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error(`Variabili ambiente mancanti: ${missingVars.join(', ')}`);
  logger.error('Assicurati che il file .env contenga tutte le variabili necessarie');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "https://img.youtube.com", "https://i.ytimg.com", "https://yt3.ggpht.com"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// CORS
let corsOrigins = [];
if (process.env.CORS_ORIGIN) {
  corsOrigins = process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
} else if (process.env.FRONTEND_URL) {
  corsOrigins = [process.env.FRONTEND_URL];
} else {
  corsOrigins = ['http://localhost:5173'];
}

// Aggiungi DOMAIN se disponibile (entrambi i protocolli: proxy HTTPS servito come HTTP)
if (process.env.DOMAIN) {
  const domain = process.env.DOMAIN.replace(/\/$/, '');
  const origins = [`https://${domain}`, `http://${domain}`];
  origins.forEach((o) => {
    if (!corsOrigins.includes(o)) corsOrigins.push(o);
  });
}

logger.info('[CORS] Origins permessi:', JSON.stringify(corsOrigins));

app.use(cors({
  origin: (origin, callback) => {
    // Permetti richieste senza origin (es. Postman, mobile apps, same-origin)
    if (!origin) {
      logger.info('[CORS] Richiesta senza origin, permessa');
      return callback(null, true);
    }
    
    logger.info('[CORS] Verifica origin:', JSON.stringify(origin));
    
    // Verifica se l'origin è nella lista permessa (match esatto o inizia con)
    const isAllowed = corsOrigins.some(allowed => {
      const match = origin === allowed || origin.startsWith(allowed);
      if (match) {
        logger.info('[CORS] Origin permessa:', JSON.stringify(origin), 'match con:', JSON.stringify(allowed));
      }
      return match;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn('[CORS] Origin non permessa:', JSON.stringify(origin), 'Origins permessi:', JSON.stringify(corsOrigins));
      callback(new Error('Not allowed by CORS'));
    }
  },
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

app.get('/api/health', async (req, res) => {
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
import shareRoutes from './routes/shareRoutes.js';
import tracksRoutes from './routes/tracksRoutes.js';
import playlistsRoutes from './routes/playlistsRoutes.js';
import youtubeRoutes from './routes/youtubeRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import usersRoutes from './routes/usersRoutes.js';
import youtubeCookiesRoutes from './routes/youtubeCookiesRoutes.js';
import metadataRoutes from './routes/metadataRoutes.js';
import apiTokenRoutes from './routes/apiTokenRoutes.js';
import downloadQueue from './utils/downloadQueue.js';
import { processDownloadJob } from './controllers/youtubeController.js';
import { processMissingMetadata } from './services/metadataBatchService.js';

// Registra listener per processare job dalla coda
downloadQueue.on('job-ready', async (job) => {
  await processDownloadJob(job);
});

// Scheduler periodico per processing metadati usando setInterval
const metadataBatchInterval = parseInt(process.env.METADATA_BATCH_INTERVAL || '24', 10); // Ore (default: 24)
const metadataBatchSize = parseInt(process.env.METADATA_BATCH_BATCH_SIZE || '10', 10);
const metadataRateLimit = parseInt(process.env.METADATA_BATCH_RATE_LIMIT_MS || '6000', 10);

// Converti ore in millisecondi
const intervalMs = metadataBatchInterval * 60 * 60 * 1000;

logger.info(`[Metadata Batch] Scheduler configurato: ogni ${metadataBatchInterval} ore (${intervalMs}ms)`);

// Esegui batch periodico con setInterval
let batchInterval = null;
if (intervalMs > 0) {
  batchInterval = setInterval(async () => {
    logger.info('[Metadata Batch] Avvio batch periodico...');
    try {
      const stats = await processMissingMetadata(metadataBatchSize, metadataRateLimit);
      logger.info(`[Metadata Batch] Batch completato: ${stats.processed} processate, ${stats.updated} aggiornate, ${stats.errors} errori`);
    } catch (error) {
      logger.error('[Metadata Batch] Errore batch periodico:', error.message);
    }
  }, intervalMs);
}

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/tracks', tracksRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/youtube/cookies', youtubeCookiesRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/api-tokens', apiTokenRoutes);

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

// Serve frontend static files (SPA fallback per /youtube-cookies, /login, ecc.)
// Risolvi path relativi rispetto a cwd (backend/ quando avviato con cd backend)
const rawFrontendPath = process.env.FRONTEND_STATIC_PATH || '/var/www/alefy';
const frontendStaticPath = path.isAbsolute(rawFrontendPath)
  ? rawFrontendPath
  : path.resolve(process.cwd(), rawFrontendPath);
if (fs.existsSync(frontendStaticPath) && fs.existsSync(path.join(frontendStaticPath, 'index.html'))) {
  try {
      // Serve file statici del frontend (CSS, JS, immagini, ecc.)
      app.use(express.static(frontendStaticPath, {
        maxAge: '1y',
        etag: true,
        lastModified: true,
      }));
      
      // Per SPA: tutte le route non-API servono index.html
      // Questo deve essere DOPO express.static ma PRIMA dell'error handler
      app.get('*', (req, res, next) => {
        // Se è una richiesta API, passa al prossimo middleware (404 handler)
        if (req.path.startsWith('/api')) {
          return next();
        }
        // Altrimenti serve index.html per React Router
        const indexPath = path.join(frontendStaticPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('Frontend non trovato');
        }
      });
      
    logger.info(`Frontend static files serviti da: ${frontendStaticPath}`);
  } catch (error) {
    logger.error(`Errore nel servire file statici frontend: ${error.message}`);
  }
} else {
  logger.warn(`Frontend non servito: ${frontendStaticPath} non trovato o index.html assente`);
}

// 404 handler per API
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Endpoint non trovato',
    },
  });
});

// Error handling (deve essere l'ultimo middleware)
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server avviato sulla porta ${PORT}`);
  logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Server in ascolto su tutte le interfacce (0.0.0.0:${PORT})`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM ricevuto, chiusura server...');
  if (typeof batchInterval !== 'undefined' && batchInterval !== null) {
    clearInterval(batchInterval);
  }
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT ricevuto, chiusura server...');
  if (typeof batchInterval !== 'undefined' && batchInterval !== null) {
    clearInterval(batchInterval);
  }
  await pool.end();
  process.exit(0);
});


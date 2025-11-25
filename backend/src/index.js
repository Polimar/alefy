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
      imgSrc: ["'self'", "data:", "blob:"],
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

// Aggiungi sempre alefy.duckdns.org se non è già presente
const alefyDuckdns = ['https://alefy.duckdns.org', 'http://alefy.duckdns.org'];
alefyDuckdns.forEach(origin => {
  if (!corsOrigins.includes(origin)) {
    corsOrigins.push(origin);
  }
});

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
import tracksRoutes from './routes/tracksRoutes.js';
import playlistsRoutes from './routes/playlistsRoutes.js';
import youtubeRoutes from './routes/youtubeRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import usersRoutes from './routes/usersRoutes.js';
import youtubeCookiesRoutes from './routes/youtubeCookiesRoutes.js';
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
app.use('/api/youtube/cookies', youtubeCookiesRoutes);
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

// Serve frontend static files (solo in produzione o se FRONTEND_STATIC_PATH è definito)
// IMPORTANTE: Questo deve essere DOPO le route API ma PRIMA dell'error handler
const frontendStaticPath = process.env.FRONTEND_STATIC_PATH || '/var/www/alefy';
if (process.env.NODE_ENV === 'production' || process.env.FRONTEND_STATIC_PATH) {
  try {
    if (fs.existsSync(frontendStaticPath)) {
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
    } else {
      logger.warn(`Frontend static path non trovato: ${frontendStaticPath}`);
    }
  } catch (error) {
    logger.error(`Errore nel servire file statici frontend: ${error.message}`);
  }
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
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT ricevuto, chiusura server...');
  await pool.end();
  process.exit(0);
});


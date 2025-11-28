import { v4 as uuidv4 } from 'uuid';
import pool from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

const generateShareTokenSchema = z.object({
  resourceType: z.enum(['track', 'playlist']),
  resourceId: z.number().int().positive(),
});

/**
 * Genera un token di condivisione per una traccia o playlist
 * Il token è valido fino a che la risorsa esiste nel DB
 */
export const generateShareToken = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    
    // Determina resourceType dalla route
    const resourceType = req.path.includes('/track/') ? 'track' : 'playlist';
    const resourceId = parseInt(id, 10);
    
    // Valida parametri
    const validated = generateShareTokenSchema.parse({
      resourceType,
      resourceId,
    });

    // Verifica che la risorsa esista
    let resourceExists = false;
    if (validated.resourceType === 'track') {
      const trackResult = await pool.query('SELECT id FROM tracks WHERE id = $1', [validated.resourceId]);
      resourceExists = trackResult.rows.length > 0;
    } else if (validated.resourceType === 'playlist') {
      const playlistResult = await pool.query('SELECT id FROM playlists WHERE id = $1', [validated.resourceId]);
      resourceExists = playlistResult.rows.length > 0;
    }

    if (!resourceExists) {
      throw new AppError(`${validated.resourceType === 'track' ? 'Traccia' : 'Playlist'} non trovata`, 404);
    }

    // Verifica se esiste già un token per questa risorsa
    const existingToken = await pool.query(
      'SELECT token FROM share_tokens WHERE resource_type = $1 AND resource_id = $2',
      [validated.resourceType, validated.resourceId]
    );

    let token;
    if (existingToken.rows.length > 0) {
      // Usa token esistente
      token = existingToken.rows[0].token;
    } else {
      // Genera nuovo token
      token = uuidv4();
      await pool.query(
        'INSERT INTO share_tokens (token, resource_type, resource_id, created_by) VALUES ($1, $2, $3, $4)',
        [token, validated.resourceType, validated.resourceId, userId]
      );
    }

    // Costruisci URL di condivisione usando DOMAIN o FRONTEND_URL
    let shareUrl;
    if (process.env.DOMAIN) {
      // Usa DOMAIN con https://
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      shareUrl = `${protocol}://${process.env.DOMAIN}/share/${token}`;
    } else if (process.env.FRONTEND_URL) {
      shareUrl = `${process.env.FRONTEND_URL}/share/${token}`;
    } else {
      shareUrl = `http://localhost:5173/share/${token}`;
    }

    res.json({
      success: true,
      data: {
        token,
        shareUrl,
        resourceType: validated.resourceType,
        resourceId: validated.resourceId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Ottiene la risorsa condivisa tramite token
 * Verifica che la risorsa esista ancora nel DB
 */
export const getSharedResource = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      throw new AppError('Token richiesto', 400);
    }

    // Ottieni informazioni sul token
    const tokenResult = await pool.query(
      'SELECT resource_type, resource_id FROM share_tokens WHERE token = $1',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      throw new AppError('Token non valido', 404);
    }

    const { resource_type, resource_id } = tokenResult.rows[0];

    // Verifica che la risorsa esista ancora nel DB
    if (resource_type === 'track') {
      const trackResult = await pool.query(
        `SELECT 
          t.id, t.title, t.artist, t.album, t.genre, t.year, t.duration, 
          t.cover_art_path, t.file_path, t.created_at
        FROM tracks t
        WHERE t.id = $1`,
        [resource_id]
      );

      if (trackResult.rows.length === 0) {
        throw new AppError('Traccia non più disponibile', 404);
      }

      const track = trackResult.rows[0];
      res.json({
        success: true,
        data: {
          type: 'track',
          track: {
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            genre: track.genre,
            year: track.year,
            duration: track.duration,
            cover_art_path: track.cover_art_path,
            created_at: track.created_at,
          },
        },
      });
    } else if (resource_type === 'playlist') {
      const playlistResult = await pool.query(
        `SELECT 
          p.id, p.name, p.description, p.cover_art_path, p.created_at,
          u.username as creator_username
        FROM playlists p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.id = $1`,
        [resource_id]
      );

      if (playlistResult.rows.length === 0) {
        throw new AppError('Playlist non più disponibile', 404);
      }

      const playlist = playlistResult.rows[0];

      // Ottieni tracce della playlist
      const tracksResult = await pool.query(
        `SELECT 
          t.id, t.title, t.artist, t.album, t.genre, t.year, t.duration,
          t.cover_art_path, pt.position
        FROM playlist_tracks pt
        JOIN tracks t ON pt.track_id = t.id
        WHERE pt.playlist_id = $1
        ORDER BY pt.position ASC`,
        [resource_id]
      );

      res.json({
        success: true,
        data: {
          type: 'playlist',
          playlist: {
            id: playlist.id,
            name: playlist.name,
            description: playlist.description,
            cover_art_path: playlist.cover_art_path,
            creator_username: playlist.creator_username,
            created_at: playlist.created_at,
            tracks: tracksResult.rows.map(track => ({
              id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              genre: track.genre,
              year: track.year,
              duration: track.duration,
              cover_art_path: track.cover_art_path,
              position: track.position,
            })),
          },
        },
      });
    }
  } catch (error) {
    next(error);
  }
};


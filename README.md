# ALEFY - Sistema di Streaming Musicale Personale

Sistema completo di streaming musicale personale con web application.

## Struttura Progetto

```
alefy/
├── backend/          # API server Node.js/Express
├── frontend/         # Web application React
├── scripts/          # Script di avvio e setup
├── docs/             # Documentazione
└── assets/           # Risorse condivise
```

## Stack Tecnologico

### Backend
- Node.js con Express
- PostgreSQL
- JWT per autenticazione
- FFmpeg per processing audio
- yt-dlp per download YouTube

### Frontend
- React con Vite
- Zustand per state management
- React Router per routing
- Axios per API calls

## Setup

### Prerequisiti

- Node.js 20+
- Sistema Debian/Ubuntu con `apt` (per installazione automatica di PostgreSQL, yt-dlp, FFmpeg)

### Primo avvio

```bash
git clone <repository-url>
cd alefy
npm install
npm run serve
```

Al primo `npm run serve` lo script esegue automaticamente:
- Installazione PostgreSQL (se mancante), creazione utente e database
- Installazione yt-dlp e FFmpeg (se mancanti)
- Creazione `.env` da `env.example` (se manca)
- `npm install` per backend e frontend
- Migrazioni database e seed

**Utente admin di default:**
- Email: `valerio@free-ware.it`
- Password: `La_F3ss4_d3_Mamm3ta`

L'applicazione è disponibile su **http://localhost:3000** (backend + frontend sulla stessa porta).

### Configurazione

Prima del primo avvio, puoi modificare `.env` (creato automaticamente da `env.example`). Variabili principali:
- `DOMAIN` - dominio per link condivisi (es. `alefy.alevale.it`)
- `STORAGE_PATH` - impostato automaticamente come path assoluto da `setup.sh`

### Avvio automatico al reboot

Per far partire ALEFY automaticamente quando la macchina si riavvia:

```bash
./scripts/install-systemd.sh
```

Comandi utili: `systemctl status alefy` | `systemctl stop alefy` | `systemctl restart alefy`

### Se npm non è trovato

Su Debian/Ubuntu come root:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

## API Endpoints

### Autenticazione
- `POST /api/auth/register` - Registrazione
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Info utente

### Tracks
- `GET /api/tracks` - Lista brani (con filtri e paginazione)
- `GET /api/tracks/:id` - Dettaglio brano
- `PUT /api/tracks/:id` - Aggiorna metadati
- `DELETE /api/tracks/:id` - Elimina brano
- `GET /api/tracks/artists` - Lista artisti
- `GET /api/tracks/albums` - Lista album
- `GET /api/tracks/genres` - Lista generi

### Upload
- `POST /api/upload/tracks` - Upload multiplo file audio

### Streaming
- `GET /api/stream/tracks/:id` - Stream audio (con Range Requests)
- `GET /api/stream/tracks/:id/cover` - Copertina album

### Playlists
- `GET /api/playlists` - Lista playlist
- `GET /api/playlists/:id` - Dettaglio playlist
- `POST /api/playlists` - Crea playlist
- `PUT /api/playlists/:id` - Aggiorna playlist
- `DELETE /api/playlists/:id` - Elimina playlist
- `POST /api/playlists/:id/tracks` - Aggiungi traccia
- `DELETE /api/playlists/:id/tracks/:trackId` - Rimuovi traccia
- `PUT /api/playlists/:id/reorder` - Riordina tracce

### YouTube
- `POST /api/youtube/download` - Download da YouTube

### Statistiche
- `GET /api/stats` - Statistiche utente

## Funzionalità

### Backend
- ✅ Autenticazione JWT con refresh token
- ✅ Upload multiplo file audio
- ✅ Estrazione metadati automatica
- ✅ Streaming audio con Range Requests
- ✅ CRUD completo per tracks e playlists
- ✅ Download da YouTube
- ✅ Statistiche e dashboard

### Frontend
- ✅ Autenticazione (login/registrazione)
- ✅ Libreria musicale con ricerca
- ✅ Upload con drag & drop
- ✅ Player audio integrato
- ✅ Gestione playlist

## Sviluppo

```bash
npm run serve
```

Avvia backend (con nodemon) e frontend (vite build --watch) sulla porta 3000. Le modifiche a backend e frontend vengono ricompilate automaticamente.

## Deployment

Backend e frontend sono serviti insieme sulla porta 3000. Per produzione dietro un reverse proxy (es. Nginx Proxy Manager), indirizza il traffico verso `http://localhost:3000`.

## Licenza

MIT

## Note

- Uso personale solo
- Non distribuzione pubblica
- Disclaimer su download da YouTube

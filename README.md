# ALEFY - Sistema di Streaming Musicale Personale

Sistema completo di streaming musicale personale con web application e app Android.

## Struttura Progetto

```
alefy/
├── backend/          # API server Node.js/Express
├── frontend/         # Web application React
├── android/          # App Android (Kotlin)
├── docker/           # Configurazioni Docker
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

### Android
- Kotlin
- Jetpack Compose
- ExoPlayer
- Room Database
- Retrofit

## Setup

### Prerequisiti
- Node.js 20+
- PostgreSQL 15+ (lo script `start-dev.sh` lo installa e configura se mancante)
- Docker e Docker Compose (opzionale)
- FFmpeg
- yt-dlp

### Installazione

1. Clona il repository:
```bash
git clone <repository-url>
cd alefy
```

2. Configura le variabili d'ambiente:
```bash
cp .env.example .env
# Modifica .env con le tue configurazioni
```

3. Setup database:
```bash
cd backend
npm install
npm run migrate
npm run seed  # Crea utente admin di default
```

L'utente admin di default è:
- Email: `valerio@free-ware.it`
- Password: `La_F3ss4_d3_Mamm3ta`

4. Avvia il backend:
```bash
npm run dev
```

5. Setup frontend:
```bash
cd frontend
npm install
npm run dev
```

**Avvio rapido** (dopo il primo setup):
```bash
# Dalla root del progetto (/home/alefy), non da scripts/
./scripts/start-dev.sh
```
Avvia backend e frontend in parallelo.

**Se npm non è trovato:** carica nvm (`source ~/.nvm/nvm.sh`) oppure installa Node.js 20+:
```bash
# Come root (senza sudo)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### Docker

Per avviare tutto con Docker:

```bash
cd docker
docker-compose up -d
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

### Android (da implementare)
- Player con ExoPlayer
- Background playback
- Download offline
- Sincronizzazione

## Sviluppo

### Backend
```bash
cd backend
npm run dev
```

### Frontend
```bash
cd frontend
npm run dev
```

## Deployment

Vedi `docker/docker-compose.yml` per la configurazione completa.

## Licenza

MIT

## Note

- Uso personale solo
- Non distribuzione pubblica
- Disclaimer su download da YouTube

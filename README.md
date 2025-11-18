# alefy

# Prompt per Cursor: Sistema di Streaming Musicale Personale "ALEFY"(Spotify Clone)

## Panoramica del Progetto
Creare un sistema completo di streaming musicale personale composto da due componenti principali:
1. **Web Application** - Piattaforma di gestione e caricamento accessibile via browser
2. **Android App** - Applicazione mobile per riproduzione e gestione playlist

---

## PARTE 1: WEB APPLICATION

### Stack Tecnologico Consigliato
- **Backend**: Node.js con Express o Python con FastAPI/Django
- **Database**: PostgreSQL per metadati + storage per files (S3-compatible o filesystem locale)
- **Frontend**: React/Vue.js/Svelte con UI moderna e responsive
- **Autenticazione**: JWT con sistema di login sicuro
- **File Processing**: FFmpeg per conversione e elaborazione audio

### Funzionalità Backend

#### Gestione Files Audio
- Upload multiplo di file audio (MP3, OGG, FLAC, WAV, M4A)
- Supporto drag & drop e progress bar per upload
- Conversione automatica in formato ottimizzato per streaming (es. MP3 320kbps o AAC)
- Estrazione automatica metadati (titolo, artista, album, copertina, durata, bitrate)
- Generazione automatica thumbnail copertine
- Sistema di storage con organizzazione per utente/artista/album
- Compressione intelligente per risparmiare spazio mantenendo qualità

#### Download da YouTube
- Input URL YouTube (singoli video o playlist)
- Download audio solo (no video) con yt-dlp o libreria simile
- Estrazione automatica metadati dal video
- Rimozione pubblicità e contenuti non musicali
- Conversione in formato audio ottimale
- Opzione per scaricare playlist intere di YouTube

#### Gestione Metadati
- Editor metadati completo (titolo, artista, album, anno, genere, numero traccia)
- Upload/modifica copertine album
- Ricerca automatica metadati online (API MusicBrainz, Last.fm, Spotify)
- Sistema di tagging personalizzato
- Supporto per album compilation e artisti multipli

#### Sistema Playlist
- Creazione playlist illimitate
- Drag & drop per riordinare brani
- Importazione playlist da file (M3U, PLS)
- Esportazione playlist
- Playlist collaborative (opzionale per futuri utenti multipli)
- Playlist intelligenti basate su criteri (genere, anno, mood, BPM)
- Sistema di filtri avanzati

#### Libreria Musicale
- Vista per artisti con tutti gli album
- Vista per album con tutte le tracce
- Vista per generi
- Vista cronologica per anno
- Vista per frequenza di ascolto
- Ricerca full-text veloce
- Sistema di filtri combinabili

#### Player Web
- Player integrato nella web UI
- Controlli standard (play, pause, skip, volume, shuffle, repeat)
- Visualizzazione copertina e metadati
- Barra progresso con seek
- Equalizzatore a 10 bande
- Crossfade tra tracce
- Normalizzazione volume
- Coda di riproduzione editabile
- Scorciatoie da tastiera (spazio, frecce, ecc.)

#### API RESTful
- Endpoints per tutte le operazioni CRUD
- Autenticazione con token JWT
- Rate limiting per prevenire abusi
- Streaming audio ottimizzato con supporto range requests
- Endpoints per sincronizzazione app mobile
- Sistema di caching intelligente
- Compressione gzip/brotli delle risposte

#### Dashboard Amministrazione
- Statistiche utilizzo storage
- Brani più ascoltati
- Generi più ascoltati
- Cronologia ascolti con grafici
- Gestione utenti (se multi-utente)
- Log di sistema e errori
- Backup automatici database

### Funzionalità Frontend

#### Design e UX
- Design moderno stile Spotify/Apple Music
- Tema dark e light mode
- Animazioni fluide e transizioni
- Responsive per desktop, tablet, mobile
- PWA (Progressive Web App) per installazione su dispositivi

#### Pagine Principali
1. **Home/Dashboard**
   - Ascoltati di recente
   - Playlist suggerite
   - Nuovi caricamenti
   - Statistiche rapide

2. **Libreria**
   - Tab per Brani/Artisti/Album/Playlist/Generi
   - Griglia/Lista view toggle
   - Ordinamento personalizzabile
   - Ricerca istantanea

3. **Upload**
   - Area drag & drop
   - Selezione multipla files
   - Progress bar per ogni file
   - Anteprima metadati pre-upload
   - Sezione YouTube download

4. **Playlist Editor**
   - Creazione/modifica playlist
   - Copertina personalizzata
   - Descrizione playlist
   - Durata totale e numero brani

5. **Profilo/Impostazioni**
   - Gestione account
   - Preferenze audio (qualità streaming, crossfade, equalizzatore)
   - Gestione storage
   - Backup/Restore

---

## PARTE 2: ANDROID APP

### Stack Tecnologico Consigliato
- **Linguaggio**: Kotlin (preferibile) o Java
- **UI**: Jetpack Compose o XML layouts
- **Networking**: Retrofit + OkHttp
- **Database Locale**: Room Database
- **Media Player**: ExoPlayer (libreria Google per streaming audio professionale)
- **Background Service**: Foreground Service per riproduzione continua

### Funzionalità Core

#### Audio Player Engine
- Integrazione ExoPlayer per streaming affidabile
- Supporto playback in background anche con schermo spento
- Gestione stato riproduzione (play, pause, stop)
- Controlli avanti/indietro traccia
- Shuffle e repeat modes (off, one, all)
- Seek nella traccia con preview
- Sistema di caching intelligente per brani riprodotti
- Gestione interruzioni (chiamate, notifiche)
- Audio focus management
- Supporto per cuffie Bluetooth e comandi media

#### Streaming e Caching
- Download brani per ascolto offline
- Cache intelligente degli ultimi brani ascoltati
- Scelta qualità streaming (low, medium, high)
- Gestione download in background
- Ripresa download interrotti
- Gestione spazio disponibile con alert

#### Interfaccia Utente

**Schermata Home**
- Ascoltati di recente
- Playlist preferite
- Shuffle all per tutta la libreria
- Ricerca rapida

**Schermata Player**
- Copertina album grande (fullscreen swipe)
- Titolo, artista, album
- Controlli playback con animazioni
- Progress bar con tempo trascorso/rimanente
- Pulsanti shuffle, repeat, like, add to playlist
- Lyrics display (se disponibili)
- Swipe gesture per next/previous
- Gesture per volume (swipe verticale)

**Schermata Libreria**
- Tab navigation: Brani, Artisti, Album, Playlist
- Ordinamento e filtri
- Ricerca locale veloce
- Pull to refresh per sincronizzazione

**Schermata Playlist**
- Lista tutte le playlist
- Creazione nuova playlist
- Modifica playlist esistenti
- Copertina playlist

**Queue Manager**
- Visualizzazione coda corrente
- Riordino con drag & drop
- Rimozione da coda
- Aggiungi successivo / Aggiungi a fine coda

#### Notifica di Riproduzione
- Notifica persistente durante playback
- Copertina, titolo, artista
- Controlli play/pause, next, previous
- Tap per aprire app
- Lock screen controls
- Android Auto integration (opzionale)

#### Sincronizzazione
- Sync automatica all'avvio app
- Sync manuale con pull-to-refresh
- Download delta (solo modifiche)
- Conflict resolution
- Indicatore stato sincronizzazione

#### Gestione Offline
- Download playlist intere
- Download singoli brani
- Indicatore brani offline
- Auto-pulizia cache vecchia
- Impostazioni storage management

#### Impostazioni App
- Account e sincronizzazione
- Qualità streaming e download
- Comportamento player (crossfade, gapless, normalizzazione)
- Gestione cache e offline
- Tema (dark/light/auto)
- Notifiche
- Gestione batteria
- About e versione

#### Features Avanzate
- Equalizzatore integrato (se non disponibile usa quello di sistema)
- Sleep timer con fade out
- Gestione cuffie (auto-pause quando disconnesse)
- Scrobbling a Last.fm (opzionale)
- Chromecast support (opzionale)
- Widget home screen
- Gesture controls avanzati
- Statistiche ascolto locale

---

## SICUREZZA E PERFORMANCE

### Backend
- Crittografia password con bcrypt/argon2
- Rate limiting su API
- Validazione input rigorosa
- Protezione CSRF
- CORS configurato correttamente
- HTTPS obbligatorio
- Token refresh mechanism
- Log accessi e operazioni sensibili
- Backup automatici schedulati

### App Android
- Token salvati in EncryptedSharedPreferences
- Certificati SSL pinnati
- Obfuscation codice (ProGuard/R8)
- Gestione errori network robusta
- Retry logic con backoff esponenziale
- Battery optimization best practices

### Performance
- Lazy loading per liste lunghe
- Paginazione API
- Image caching (Coil/Glide per Android)
- Database indexing ottimizzato
- CDN per static assets (opzionale)
- Compressione asset audio

---

## DEPLOYMENT

### Backend
- Docker container per facile deployment
- docker-compose.yml per ambiente completo
- Nginx come reverse proxy
- Variabili ambiente per configurazione
- Script di backup automatici
- Monitoring con logs centralizzati

### App Android
- Build variants (debug, release)
- Versioning automatico
- APK firmato per release
- Supporto aggiornamenti (in-app update opzionale)

---

## FASI DI SVILUPPO SUGGERITE

### Fase 1 - MVP Backend
1. Setup progetto e database
2. Autenticazione utente
3. Upload e gestione files MP3 base
4. API streaming audio
5. Creazione playlist base

### Fase 2 - MVP Android
1. Setup progetto Android
2. Login e autenticazione
3. Player base con ExoPlayer
4. Lista brani e playlist
5. Background playback

### Fase 3 - Funzionalità Avanzate Backend
1. Download YouTube
2. Editor metadati avanzato
3. Gestione album e artisti
4. Dashboard statistiche
5. Player web integrato

### Fase 4 - Funzionalità Avanzate Android
1. Download offline
2. Notifica avanzata
3. Widget
4. Equalizzatore
5. Gesture controls

### Fase 5 - Polish e Ottimizzazione
1. UI/UX refinement
2. Performance optimization
3. Testing completo
4. Bug fixing
5. Documentazione

---

## NOTE TECNICHE IMPORTANTI

### Audio Streaming
- Implementare HTTP Range Requests per seeking efficiente
- Usare HLS o DASH per adaptive streaming (opzionale)
- Supportare resume download parziali

### YouTube Download
- Usare yt-dlp (fork aggiornato di youtube-dl)
- Gestire rate limiting YouTube
- Cookie management per accesso a contenuti con restrizioni
- Disclaimer legale per uso personale

### Database Schema Suggerito
```
Users (id, email, password_hash, created_at)
Tracks (id, user_id, title, artist, album, file_path, duration, file_size, cover_art, year, genre, bitrate)
Playlists (id, user_id, name, description, cover_art, created_at)
PlaylistTracks (playlist_id, track_id, position)
PlayHistory (id, user_id, track_id, played_at)
```

### Considerazioni Legali
- Uso personale solo
- Non distribuzione pubblica
- Disclaimer su download da YouTube
- Backup dei propri acquisti musicali legali

---

## OUTPUT ATTESO DA CURSOR

Generare una codebase completa e funzionante con:
- Repository strutturato con monorepo o progetti separati
- Documentazione README.md dettagliata
- Setup instructions passo-passo
- Environment variables template
- Docker setup completo
- Codice commentato e ben organizzato
- Best practices seguite
- Testing setup (opzionale ma consigliato)
- Script di utilità per sviluppo

**Priorità: funzionalità > estetica, ma con UI moderna e usabile. Focus su stabilità e performance per l'app Android soprattutto per background playback.**

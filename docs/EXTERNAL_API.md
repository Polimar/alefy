# API esterna Alefy

Documentazione per l’accesso all’API Alefy da software esterni (client, script, app) tramite **token API permanente**.

## Base URL

- **Da internet**: `https://alefy.alevale.it`
- **Da LAN** (es. client Beat Saber sullo stesso network): `http://192.168.1.186` (porta 80 o 443 a seconda di come è esposto il CT)

Usa sempre la base URL senza trailing slash (es. `https://alefy.alevale.it`).

## Autenticazione

Tutte le richieste devono includere l’header:

```
Authorization: Bearer <token>
```

Il token è una stringa permanente (es. `alefy_xxxxxxxx...`) fornita una sola volta alla creazione. **Non scade** finché non viene revocato.

### Ottenere un token

Solo un **amministratore** può creare token:

1. **Da API** (con JWT di un utente admin):
   ```bash
   curl -X POST https://alefy.alevale.it/api/api-tokens \
     -H "Authorization: Bearer <JWT_ACCESS_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Beat Saber client"}'
   ```
   La risposta contiene il campo `data.token` (token in chiaro): **salvalo subito**, non viene più restituito.

2. **Body opzionale**: `user_id` (numero) per associare il token a un altro utente; se omesso, il token è associato all’admin che lo crea.

---

## Endpoint

### GET /api/tracks

Lista tracce con paginazione e filtri.

**Query (tutte opzionali):**

| Parametro  | Tipo   | Descrizione                                      |
|------------|--------|--------------------------------------------------|
| `page`     | number | Pagina (default: 1)                             |
| `limit`    | number | Elementi per pagina (default: 50, max: 100)     |
| `search`   | string | Cerca in title, artist, album (ILIKE)            |
| `artist`   | string | Filtra per artista (ILIKE)                       |
| `album`    | string | Filtra per album (ILIKE)                         |
| `genre`    | string | Filtra per genere (esatto)                      |
| `year`     | number | Filtra per anno                                  |
| `orderBy`  | string | `title`, `artist`, `album`, `year`, `created_at`, `play_count`, `last_played_at`, `duration` |
| `orderDir` | string | `asc` o `desc` (default: `desc`)                 |

**Risposta:**

```json
{
  "success": true,
  "data": {
    "tracks": [
      {
        "id": 1,
        "title": "...",
        "artist": "...",
        "album": "...",
        "album_artist": "...",
        "genre": "...",
        "year": 2024,
        "track_number": 1,
        "disc_number": 1,
        "duration": 240,
        "file_size": 12345678,
        "cover_art_path": "...",
        "play_count": 0,
        "last_played_at": null,
        "created_at": "..."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 100,
      "totalPages": 2
    }
  }
}
```

---

### GET /api/tracks/:id

Dettaglio di una singola traccia.

**Risposta:**

```json
{
  "success": true,
  "data": {
    "track": {
      "id": 1,
      "title": "...",
      "artist": "...",
      "album": "...",
      ...
    }
  }
}
```

---

### GET /api/stream/tracks/:id

Stream del file audio. Supporta **Range** per lo streaming a chunk.

**Query:**

| Parametro  | Valore   | Descrizione                                      |
|------------|----------|--------------------------------------------------|
| `download` | `1` o `true` | Imposta `Content-Disposition: attachment` per scaricare come file |

**Header di richiesta (opzionale):** `Range: bytes=0-` per ricevere solo una parte del file.

**Risposta:** body binario (audio), `Content-Type: audio/mpeg`.

---

### GET /api/stream/tracks/:id/cover

Restituisce l’immagine di copertina della traccia.

**Risposta:** body binario (immagine), `Content-Type: image/jpeg` o `image/png`.

---

## Esempi cURL

**Lista tracce (prima pagina):**
```bash
curl -s "https://alefy.alevale.it/api/tracks?limit=10" \
  -H "Authorization: Bearer alefy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Ricerca:**
```bash
curl -s "https://alefy.alevale.it/api/tracks?search=beatles&limit=20" \
  -H "Authorization: Bearer alefy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Dettaglio traccia:**
```bash
curl -s "https://alefy.alevale.it/api/tracks/1" \
  -H "Authorization: Bearer alefy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Stream audio:**
```bash
curl -s "https://alefy.alevale.it/api/stream/tracks/1" \
  -H "Authorization: Bearer alefy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -o track.mp3
```

**Download come file (con nome):**
```bash
curl -s "https://alefy.alevale.it/api/stream/tracks/1?download=1" \
  -H "Authorization: Bearer alefy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -o "MySong.mp3"
```

**Copertina:**
```bash
curl -s "https://alefy.alevale.it/api/stream/tracks/1/cover" \
  -H "Authorization: Bearer alefy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -o cover.jpg
```

---

## Codici di errore

| Codice | Significato                                      |
|--------|--------------------------------------------------|
| 401    | Token mancante o non valido                      |
| 403    | Accesso negato (es. operazione richiede JWT)      |
| 404    | Traccia o risorsa non trovata                    |
| 416    | Range non soddisfacibile (stream)                |
| 429    | Troppe richieste (rate limit)                    |
| 5xx    | Errore server                                    |

Le risposte di errore hanno forma:

```json
{
  "success": false,
  "error": {
    "message": "Token non valido"
  }
}
```

---

## Gestione token (solo admin, con JWT)

Le seguenti route **richiedono login dal browser** (JWT), non il token API.

- **GET /api/api-tokens** — Elenco token (senza valore in chiaro).  
  Header: `Authorization: Bearer <JWT>`

- **POST /api/api-tokens** — Crea token.  
  Body: `{ "name": "Nome descrittivo", "user_id": 1 }` (opzionale).  
  Risposta: `data.token` con il token in chiaro (salvare subito).

- **DELETE /api/api-tokens/:id** — Revoca un token.

---

## Integrazione client (Beat Saber / Unity)

Se usi **IAlefyClient** e **AlefyService** in Unity:

| Client                    | API Alefy |
|---------------------------|-----------|
| `GetSongsAsync()`         | **GET** `/api/tracks` (con paginazione; opzionale `?search=`, `?artist=`, ecc.) |
| `PrepareSongAsync(trackId)` | **GET** `/api/stream/tracks/:id` (stream) o `?download=1` per scaricare il file |
| **AlefySettings.BaseUrl** | `https://alefy.alevale.it` (internet) oppure `http://192.168.1.186` (LAN) |
| **AlefySettings.AuthToken** | Il token permanente (es. `alefy_xxxx...`); inviare in ogni richiesta come header `Authorization: Bearer <AuthToken>` |

Configura **AlefySettings** (Assets → Create → BeatSaberAlefy → Alefy Settings) con BaseUrl e AuthToken come sopra.

---

## Setup server (migration)

Dopo aver aggiunto il supporto API token, sul CT eseguire la migration:

```bash
cd /path/to/alefy/backend && npm run migrate
```

Questo crea la tabella `api_tokens` se non esiste.

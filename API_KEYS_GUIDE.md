# Guida per ottenere le API Key per il riconoscimento audio

Questa guida spiega come ottenere le API key necessarie per migliorare il rate limit del sistema di riconoscimento audio.

## AcoustID API Key

AcoustID è un servizio gratuito per il riconoscimento audio tramite fingerprint. Un'API key migliora il rate limit da ~1 richiesta/secondo a ~10 richieste/secondo.

### Come ottenere l'API key:

1. **Registrazione**:
   - Vai su https://acoustid.org/
   - Clicca su "Register" o "Sign up"
   - Compila il form con email e password

2. **Creare applicazione**:
   - Dopo il login, vai su "My Applications" o "API Keys"
   - Clicca su "Create Application" o "New API Key"
   - Compila i campi:
     - **Name**: ALEFY (o un nome a tua scelta)
     - **Version**: 1.0.0
     - **Website**: Il tuo dominio (es. https://alefy.duckdns.org)

3. **Ottenere API Key**:
   - Dopo la creazione, vedrai l'API key (una stringa alfanumerica)
   - Copia questa chiave

4. **Configurazione**:
   - Aggiungi nel file `.env` del backend:
     ```
     ACOUSTID_API_KEY=la_tua_api_key_qui
     ```
   - Riavvia il servizio backend

### Note:
- L'API key è gratuita
- Migliora significativamente il rate limit
- Non è obbligatoria ma altamente consigliata

## Last.fm API Key

Last.fm fornisce informazioni aggiuntive sui generi musicali. L'API key è gratuita ma opzionale.

### Come ottenere l'API key:

1. **Registrazione**:
   - Vai su https://www.last.fm/api/account/create
   - Compila il form con:
     - **Application name**: ALEFY
     - **Application description**: Music library metadata enrichment
     - **Callback URL**: https://alefy.duckdns.org (o il tuo dominio)
     - **Application website**: https://alefy.duckdns.org

2. **Ottenere API Key**:
   - Dopo la creazione, vedrai:
     - **API Key**: una stringa alfanumerica
     - **Shared Secret**: non necessario per il nostro uso

3. **Configurazione**:
   - Aggiungi nel file `.env` del backend:
     ```
     LASTFM_API_KEY=la_tua_api_key_qui
     ```
   - Riavvia il servizio backend

### Note:
- L'API key è gratuita
- Usata principalmente per ottenere informazioni sui generi musicali
- Non è obbligatoria (MusicBrainz può funzionare senza)

## Rate Limiting

Il sistema include già rate limiting integrato per evitare ban dalle API:

- **Default**: 1 richiesta ogni 6 secondi (6000ms)
- Configurabile tramite `METADATA_BATCH_RATE_LIMIT_MS` nel `.env`
- Il batch processa massimo 10 tracce per volta (configurabile con `METADATA_BATCH_BATCH_SIZE`)

### Consigli per evitare ban:

1. **Usa le API key**: Migliorano significativamente i rate limit
2. **Non modificare troppo il rate limit**: 6 secondi è un buon compromesso
3. **Processa in batch piccoli**: Il default di 10 tracce per batch è ottimale
4. **Esegui batch periodicamente**: Non processare tutto in una volta

## Installazione Chromaprint

Per generare i fingerprint audio, è necessario installare `chromaprint`:

### Su Ubuntu/Debian:
```bash
apt-get update
apt-get install -y chromaprint-tools
```

### Su altre distribuzioni:
```bash
# Fedora/RHEL
dnf install chromaprint-tools

# Arch Linux
pacman -S chromaprint

# macOS (con Homebrew)
brew install chromaprint
```

Lo script `lxc-update.sh` installa automaticamente chromaprint durante l'aggiornamento.

## Verifica installazione

Dopo aver configurato tutto, puoi verificare che funzioni:

1. **Verifica chromaprint**:
   ```bash
   fpcalc --version
   # o
   chromaprint --version
   ```

2. **Test API**:
   ```bash
   curl http://localhost:3000/api/metadata/status/1
   ```

3. **Avvia processing manuale** (come admin):
   ```bash
   curl -X POST http://localhost:3000/api/metadata/process-all \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"limit": 5}'
   ```

## Monitoraggio

Le statistiche sono visibili nella sidebar del frontend:
- **Totali**: Numero totale di tracce
- **Processate**: Tracce che sono state sottoposte a riconoscimento
- **Riconosciute**: Tracce riconosciute con successo (con metadata_source diverso da 'manual')

Il batch viene eseguito automaticamente ogni 24 ore (configurabile con `METADATA_BATCH_INTERVAL`).



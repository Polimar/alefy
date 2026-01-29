# Comandi SSH per Aggiornare Alefy su LXC

## Connessione SSH al Container

```bash
# Connettiti al container (IP: 192.168.1.186)
ssh root@192.168.1.186
# Password: Polimar75
```

## Deploy nuova implementazione (API token) su alefy.alevale.it

Per far partire l’API con token permanente su alefy.alevale.it:

1. **Connettiti al CT** (vedi sopra).

2. **Esegui lo script di aggiornamento** (aggiorna repo, backend, migration 008, frontend, riavvio):
   ```bash
   cd /tmp/alefy
   # Se git segnala "dubious ownership" (repo clonato da altro utente), una tantum:
   git config --global --add safe.directory /tmp/alefy
   git pull origin main
   DOMAIN=alefy.alevale.it ./scripts/lxc-update.sh
   ```
   Se il repo è in un’altra directory:
   ```bash
   cd /opt/alefy/repo   # oppure il path dove hai clonato
   git pull origin main
   DOMAIN=alefy.alevale.it REPO_DIR=/opt/alefy/repo ./scripts/lxc-update.sh
   ```

3. **Verifica**: lo script esegue già le migration (inclusa `008_add_api_tokens`). Controlla che il backend risponda:
   ```bash
   curl -s http://localhost:3000/api/health
   ```

4. **Crea il primo token API** (da un client con JWT admin, es. browser loggato come admin):
   ```bash
   curl -X POST https://alefy.alevale.it/api/api-tokens \
     -H "Authorization: Bearer <JWT_ACCESS_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Beat Saber client"}'
   ```
   Salva il valore `data.token` dalla risposta; non viene più restituito.

Documentazione completa API: [docs/EXTERNAL_API.md](EXTERNAL_API.md).

---

## Aggiornamento Completo dell'Applicazione

### Metodo 1: Script Automatico (Consigliato)

```bash
# Aggiorna repository
cd /tmp/alefy
git pull origin main

# Ricostruisci frontend (gestisce automaticamente tutto)
DOMAIN=alevale.iliadboxos.it ./scripts/lxc-rebuild-frontend.sh

# Aggiorna backend
cd /opt/alefy/repo
git pull origin main
cp -r backend/* /opt/alefy/backend/
cd /opt/alefy/backend
npm install uuid
systemctl restart alefy
```

### Metodo 2: Manuale

#### 1. Aggiorna Repository e Installa Nuove Dipendenze Backend

```bash
# Vai alla directory del repository
cd /opt/alefy/repo

# Aggiorna il repository
git pull origin main

# Copia i nuovi file backend
cp -r backend/* /opt/alefy/backend/

# Installa nuove dipendenze backend (incluso uuid)
cd /opt/alefy/backend
npm install uuid

# Verifica che uuid sia installato
npm list uuid

# Riavvia backend
systemctl restart alefy
```

#### 2. Ricostruisci Frontend con Script

```bash
# Usa lo script di rebuild (gestisce permessi e tutto automaticamente)
cd /tmp/alefy
DOMAIN=alevale.iliadboxos.it ./scripts/lxc-rebuild-frontend.sh
```

#### 3. Oppure Rebuild Frontend Manuale

```bash
# Aggiorna repository se non già fatto
cd /opt/alefy/repo
git pull origin main

# Copia nuovi file frontend
cp -r /opt/alefy/repo/frontend/* /opt/alefy/frontend/
chown -R alefy:alefy /opt/alefy/frontend

# Vai nella directory frontend
cd /opt/alefy/frontend

# Configura ambiente
cat > .env.production <<EOF
VITE_API_URL=https://alevale.iliadboxos.it/api
EOF
chown alefy:alefy .env.production

# Rimuovi build precedente (gestisci permessi)
chown -R alefy:alefy dist 2>/dev/null || true
rm -rf dist

# Installa dipendenze se necessario
npm install

# Build frontend
npm run build

# Copia nuovo build
cp -r dist/* /var/www/alefy/
chown -R www-data:www-data /var/www/alefy

# Riavvia Nginx
systemctl reload nginx
```

### 4. Verifica Installazione

```bash
# Verifica status backend
systemctl status alefy

# Verifica log backend (ultimi 50 righe)
journalctl -u alefy -n 50

# Verifica log in tempo reale
journalctl -u alefy -f

# Test API
curl http://localhost:3000/api/health
```

## Comandi Rapidi per Gestione

### Status e Log

```bash
# Status servizio
systemctl status alefy

# Log in tempo reale
journalctl -u alefy -f

# Ultimi 100 log
journalctl -u alefy -n 100

# Log con timestamp
journalctl -u alefy --since "1 hour ago"
```

### Riavvio Servizi

```bash
# Riavvia backend
systemctl restart alefy

# Riavvia Nginx
systemctl restart nginx

# Riavvia PostgreSQL
systemctl restart postgresql
```

### Verifica Dipendenze

```bash
# Verifica Node.js
node -v
npm -v

# Verifica dipendenze backend
cd /opt/alefy/backend
npm list

# Verifica uuid installato
npm list uuid
```

### Verifica File e Directory

```bash
# Verifica directory backend
ls -la /opt/alefy/backend/

# Verifica directory frontend
ls -la /opt/alefy/frontend/

# Verifica build frontend
ls -la /var/www/alefy/

# Verifica nuovo file downloadQueue.js
ls -la /opt/alefy/backend/src/utils/downloadQueue.js
```

## Aggiornamento Rapido (Script Completo)

Esegui tutti questi comandi in sequenza:

```bash
# 1. Aggiorna repository
cd /opt/alefy/repo && git pull origin main

# 2. Copia backend e installa dipendenze
cp -r backend/* /opt/alefy/backend/
cd /opt/alefy/backend && npm install uuid

# 3. Copia frontend e rebuild
cp -r /opt/alefy/repo/frontend/* /opt/alefy/frontend/
cd /opt/alefy/frontend && npm install && npm run build
cp -r dist/* /var/www/alefy/
chown -R www-data:www-data /var/www/alefy

# 4. Riavvia servizi
systemctl restart alefy
systemctl reload nginx

# 5. Verifica
systemctl status alefy
journalctl -u alefy -n 20
```

## Risoluzione Problemi

### Backend non si avvia dopo aggiornamento

```bash
# Controlla errori nei log
journalctl -u alefy -n 50

# Verifica che uuid sia installato
cd /opt/alefy/backend
npm list uuid

# Se manca, installa manualmente
npm install uuid

# Riavvia
systemctl restart alefy
```

### Errore "Cannot find module 'uuid'"

```bash
cd /opt/alefy/backend
npm install uuid
systemctl restart alefy
```

### Frontend non si aggiorna

```bash
# Verifica che il build sia stato copiato
ls -la /var/www/alefy/

# Rebuild completo
cd /opt/alefy/frontend
rm -rf node_modules dist
npm install
npm run build
cp -r dist/* /var/www/alefy/
chown -R www-data:www-data /var/www/alefy
systemctl reload nginx
```

### Verifica che le nuove funzionalità funzionino

```bash
# Test endpoint coda
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/youtube/queue

# Verifica log per errori
journalctl -u alefy -f
```

## Note Importanti

- **Sempre eseguire come root** quando si gestiscono i servizi systemd
- **Backup database** prima di aggiornamenti importanti: `pg_dump alefy_db > backup.sql`
- **Verificare i log** dopo ogni aggiornamento: `journalctl -u alefy -n 50`
- **Testare l'applicazione** dopo l'aggiornamento per verificare che tutto funzioni


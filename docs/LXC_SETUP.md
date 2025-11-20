# Installazione Alefy su Proxmox LXC

Questa guida descrive come installare Alefy su un container Proxmox LXC per un ambiente di produzione ottimizzato e leggero.

## Requisiti

### Container LXC
- **OS:** Debian 12 (Bookworm) o Ubuntu 22.04 LTS
- **RAM:** Minimo 2GB (consigliato 4GB)
- **CPU:** Minimo 2 cores
- **Storage:** Minimo 20GB (consigliato 50GB+ per musica)
- **Rete:** Accesso internet per download dipendenze

### Prerequisiti
- Accesso root al container
- Dominio configurato (opzionale, per SSL)
- Porte aperte: 80 (HTTP), 443 (HTTPS), 22 (SSH)

## Installazione

### 1. Creazione Container su Proxmox

1. Accedi all'interfaccia Proxmox
2. Crea nuovo CT (Container)
3. Seleziona template Debian 12 o Ubuntu 22.04
4. Configura risorse:
   - RAM: 2-4GB
   - CPU: 2-4 cores
   - Storage: 20GB+ (più se hai molta musica)
5. Configura rete con IP statico o DHCP
6. Avvia il container

### 2. Accesso al Container

```bash
# Da Proxmox host
pct enter <CT_ID>

# Oppure via SSH se configurato
ssh root@<container-ip>
```

### 3. Download Script di Installazione

```bash
# Installa git se non presente
apt-get update && apt-get install -y git

# Clone repository
git clone https://github.com/Polimar/alefy.git /tmp/alefy
cd /tmp/alefy
```

### 4. Esecuzione Installazione

```bash
# Rendi eseguibile
chmod +x scripts/lxc-install.sh

# Esegui installazione (come root)
./scripts/lxc-install.sh
```

Lo script installerà automaticamente:
- Dipendenze di sistema (Node.js, PostgreSQL, Nginx, FFmpeg, yt-dlp)
- Backend Node.js con dipendenze
- Frontend React (build di produzione)
- Database PostgreSQL con schema iniziale
- Servizio Systemd per backend
- Configurazione Nginx
- Utente admin di default

### 5. Configurazione Dominio (Opzionale)

Se hai un dominio configurato:

```bash
# Esegui con variabili ambiente
DOMAIN=alevale.iliadboxos.it EMAIL=valerio@free-ware.it ./scripts/lxc-install.sh
```

Oppure modifica manualmente dopo l'installazione:

```bash
# Modifica configurazione Nginx
nano /etc/nginx/sites-available/alefy
# Cambia server_name _; in server_name tuo-dominio.com;

# Riavvia Nginx
systemctl reload nginx
```

### 6. Setup SSL con Let's Encrypt

Dopo aver configurato il dominio e verificato che punti al server:

```bash
# Setup SSL automatico
certbot --nginx -d alevale.iliadboxos.it --non-interactive --agree-tos --email valerio@free-ware.it

# Verifica rinnovo automatico
certbot renew --dry-run
```

## Risoluzione Problemi

### Installazione Incompleta

Se l'installazione è stata interrotta o il servizio `alefy` non esiste:

```bash
# Scarica script di diagnostica
git clone https://github.com/Polimar/alefy.git /tmp/alefy
cd /tmp/alefy

# Esegui script di diagnostica e correzione
chmod +x scripts/lxc-diagnose.sh
./scripts/lxc-diagnose.sh
```

Lo script di diagnostica:
- Verifica e crea utente `alefy` se mancante
- Installa Node.js se assente
- Clona/aggiorna il repository
- Copia backend e frontend
- Crea file `.env` con configurazione
- Installa dipendenze
- Esegue migrazioni database
- Builda il frontend
- Crea e avvia il servizio Systemd

## Verifica Installazione

### Controllo Servizi

```bash
# Status backend
systemctl status alefy

# Status Nginx
systemctl status nginx

# Status PostgreSQL
systemctl status postgresql
```

### Controllo Log

```bash
# Log backend
journalctl -u alefy -f

# Log Nginx
tail -f /var/log/nginx/alefy-access.log
tail -f /var/log/nginx/alefy-error.log
```

### Test Accesso

- **Frontend:** http://container-ip o https://tuo-dominio.com
- **API:** http://container-ip/api o https://tuo-dominio.com/api
- **Credenziali admin:**
  - Email: `valerio@free-ware.it`
  - Password: `La_F3ss4_d3_Mamm3ta`

## Gestione Servizi

### Backend

```bash
# Avvia
systemctl start alefy

# Ferma
systemctl stop alefy

# Riavvia
systemctl restart alefy

# Status
systemctl status alefy

# Log in tempo reale
journalctl -u alefy -f

# Log ultimi 100 righe
journalctl -u alefy -n 100
```

### Nginx

```bash
# Riavvia
systemctl restart nginx

# Ricarica configurazione (senza downtime)
systemctl reload nginx

# Test configurazione
nginx -t

# Log
tail -f /var/log/nginx/alefy-access.log
tail -f /var/log/nginx/alefy-error.log
```

### PostgreSQL

```bash
# Accesso database
sudo -u postgres psql alefy_db

# Backup database
sudo -u postgres pg_dump alefy_db > backup_$(date +%Y%m%d).sql

# Ripristino database
sudo -u postgres psql alefy_db < backup.sql
```

## Struttura Directory

```
/opt/alefy/
├── backend/          # Codice backend Node.js
│   ├── src/         # Sorgenti
│   ├── .env         # Configurazione (credenziali)
│   └── node_modules/
├── frontend/         # Codice frontend React
│   └── dist/        # Build produzione (copiato in /var/www/alefy)
├── storage/          # File audio caricati/scaricati
└── logs/            # Log applicazione

/var/www/alefy/       # File statici frontend serviti da Nginx
```

## Configurazione

### Variabili Ambiente Backend

File: `/opt/alefy/backend/.env`

```bash
# Modifica configurazione
nano /opt/alefy/backend/.env

# Dopo modifiche, riavvia backend
systemctl restart alefy
```

### Configurazione Nginx

File: `/etc/nginx/sites-available/alefy`

```bash
# Modifica configurazione
nano /etc/nginx/sites-available/alefy

# Test configurazione
nginx -t

# Applica modifiche
systemctl reload nginx
```

## Backup

### Backup Database

```bash
# Backup manuale
sudo -u postgres pg_dump alefy_db > /backup/alefy_db_$(date +%Y%m%d_%H%M%S).sql

# Backup automatico (cron)
# Aggiungi a crontab: 0 2 * * * sudo -u postgres pg_dump alefy_db > /backup/alefy_db_$(date +\%Y\%m\%d).sql
```

### Backup Storage

```bash
# Backup file audio
tar -czf /backup/alefy_storage_$(date +%Y%m%d).tar.gz /opt/alefy/storage/
```

## Aggiornamento

### Aggiornamento Applicazione

```bash
# Entra nella directory repo
cd /opt/alefy/repo

# Pull ultime modifiche
git pull

# Copia nuovi file
cp -r backend/* /opt/alefy/backend/
cp -r frontend/* /opt/alefy/frontend/

# Aggiorna dipendenze backend
cd /opt/alefy/backend
npm ci --production

# Esegui migrazioni se necessario
npm run migrate

# Rebuild frontend
cd /opt/alefy/frontend
npm ci
npm run build

# Copia nuovo build
cp -r dist/* /var/www/alefy/

# Riavvia servizi
systemctl restart alefy
systemctl reload nginx
```

## Troubleshooting

### Backend non si avvia

```bash
# Controlla log
journalctl -u alefy -n 50

# Verifica configurazione
cat /opt/alefy/backend/.env

# Test manuale
cd /opt/alefy/backend
node src/index.js
```

### Nginx errori 502

```bash
# Verifica che backend sia in esecuzione
systemctl status alefy

# Verifica porta
netstat -tlnp | grep 3000

# Test connessione
curl http://localhost:3000/api/auth/me
```

### Problemi database

```bash
# Verifica PostgreSQL
systemctl status postgresql

# Test connessione
sudo -u postgres psql -c "SELECT version();"

# Verifica database
sudo -u postgres psql alefy_db -c "\dt"
```

### Problemi SSL

```bash
# Verifica certificati
certbot certificates

# Rinnova manualmente
certbot renew

# Test configurazione Nginx
nginx -t
```

## Performance

### Ottimizzazioni Consigliate

1. **PostgreSQL tuning** (`/etc/postgresql/*/main/postgresql.conf`):
   - `shared_buffers = 256MB` (25% RAM)
   - `effective_cache_size = 1GB` (50% RAM)
   - `maintenance_work_mem = 64MB`

2. **Nginx caching** (già configurato per file statici)

3. **Node.js clustering** (opzionale, per carichi elevati)

## Supporto

Per problemi o domande:
- Repository: https://github.com/Polimar/alefy
- Issues: https://github.com/Polimar/alefy/issues



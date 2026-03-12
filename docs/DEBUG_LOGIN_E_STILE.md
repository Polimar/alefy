# Risoluzione: "Cannot GET /login" e stile bianco

## Problema 1: "Cannot GET /login" (desktop)

L'errore indica che il server non gestisce correttamente le route SPA (React Router). Quando accedi a `alefy.alevale.it/login` direttamente, il server cerca un file `/login` invece di servire `index.html`.

### Causa probabile: Nginx Proxy Manager

Se usi **Nginx Proxy Manager** (NPM), la configurazione può essere:

**A) Proxy verso backend (porta 3000)** – configurazione corretta  
Tutto il traffico va al backend Express, che serve il frontend con fallback SPA.

**B) File statici serviti da NPM** – può causare l’errore  
NPM serve i file da `/var/www/alefy` senza fallback per le route SPA.

### Soluzione

**Se usi NPM con proxy verso backend (porta 3000):**

1. In NPM → Proxy Host → alefy.alevale.it
2. Verifica che **Forward Hostname/IP** sia l’IP del server (es. `127.0.0.1` o IP LXC)
3. Verifica che **Forward Port** sia `3000`
4. In **Advanced** → **Custom Nginx Configuration**, assicurati che non ci siano `location` che intercettano `/` o `/login`

**Se NPM serve file statici da una cartella:**

Aggiungi in **Advanced** → **Custom Nginx Configuration**:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

**Alternativa:** fai passare tutto al backend (porta 3000) e lascia che sia il backend a servire il frontend.

---

## Problema 2: Pagina bianca / nessuno stile (mobile e desktop)

Se la pagina si carica ma vedi sfondo bianco, testo nero e link viola invece del tema scuro con accent verde:

### Cause probabili

1. **Build non aggiornato** – il frontend in produzione non include le ultime modifiche
2. **Cache del browser** – il browser usa una versione vecchia
3. **PWA / Service Worker** – la cache della PWA serve una versione obsoleta

### Soluzione

**1. Ricostruire e ridistribuire il frontend**

Sul server (LXC o dove gira alefy):

```bash
# Da /home/alefy (o /opt/alefy)
DOMAIN=alefy.alevale.it REPO_DIR=/home/alefy ./scripts/lxc-rebuild-frontend.sh
```

Oppure manualmente:

```bash
cd /home/alefy/frontend
npm run build
sudo mkdir -p /var/www/alefy
sudo rm -rf /var/www/alefy/*
sudo cp -r dist/* /var/www/alefy/
sudo chown -R www-data:www-data /var/www/alefy
```

**2. Verificare la versione del build**

Dopo il deploy, apri `https://alefy.alevale.it` e controlla il footer o la console: dovresti vedere un indicatore di versione (es. "v2025.03.12") se è stato aggiunto.

**3. Svuotare la cache**

- **Desktop:** `Ctrl+Shift+R` (Windows/Linux) o `Cmd+Shift+R` (Mac)
- **Mobile:** Impostazioni browser → Cancella dati di navigazione / Cache
- **PWA:** Se hai installato l’app, disinstalla e reinstalla, oppure svuota la cache dal browser

**4. Verificare che il backend serva il frontend**

Sul server:

```bash
# Verifica che i file esistano
ls -la /var/www/alefy/

# Verifica che il backend abbia FRONTEND_STATIC_PATH
grep FRONTEND_STATIC_PATH /opt/alefy/backend/.env
# Deve essere: FRONTEND_STATIC_PATH=/var/www/alefy

# Riavvia il backend dopo aver copiato i file
sudo systemctl restart alefy
```

---

## Riepilogo

| Sintomo | Causa | Azione |
|---------|-------|--------|
| Cannot GET /login | NPM o server non gestisce route SPA | Configurare `try_files` o far passare tutto al backend |
| Pagina bianca / stile sbagliato | Build vecchio o cache | Ricostruire frontend, copiare in `/var/www/alefy`, svuotare cache |

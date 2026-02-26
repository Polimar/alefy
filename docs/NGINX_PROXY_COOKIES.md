# Configurazione proxy per upload cookies YouTube

Se usi **Nginx Proxy Manager** (o un proxy simile) e vedi l'errore "Il file è troppo grande" quando carichi i cookies YouTube, aumenta il limite della dimensione della richiesta per le API.

## Nginx Proxy Manager

1. Vai su **Proxy Host** → seleziona il proxy per alefy
2. Tab **Advanced** → **Custom Nginx Configuration**
3. Aggiungi:

```nginx
location /api/youtube/cookies {
    client_max_body_size 10M;
    proxy_pass http://<IP_BACKEND>:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Oppure, per applicare il limite a tutte le API:

```nginx
location /api {
    client_max_body_size 10M;
    # ... resto configurazione proxy esistente
}
```

4. Salva e **Test Configuration** → **Save**

## Ricostruzione frontend

Dopo le modifiche al codice, ricostruisci il frontend per aggiornare alefy.alevale.it:

```bash
cd /home/alefy/frontend   # o /opt/alefy/frontend
npm run build
cp -r dist/* /var/www/alefy/
```

Oppure usa lo script:

```bash
REPO_DIR=/home/alefy ./scripts/lxc-rebuild-frontend.sh
```

## Cache del browser

Se l'errore persiste: **Ctrl+Shift+R** (o Cmd+Shift+R su Mac) per ricaricare ignorando la cache.

# Dipendenze metadati (fingerprint + Shazam)

Per il riconoscimento automatico dei metadati (AcoustID e Shazam) servono:

- **chromaprint** (fornisce `fpcalc`) – fingerprint audio
- **Python 3** + **ShazamIO** – riconoscimento Shazam

## Installazione rapida (LXC)

```bash
# Nel container, come root
cd /tmp/alefy   # oppure dove hai clonato il repo
git pull origin main
chmod +x scripts/install-metadata-deps.sh
./scripts/install-metadata-deps.sh

# Riavvia backend
systemctl restart alefy
```

Se Alefy è in un’altra directory:

```bash
ALEFY_HOME=/opt/alefy ./scripts/install-metadata-deps.sh
```

## Installazione manuale

### Chromaprint (fpcalc)

**Debian/Ubuntu:**
```bash
apt-get update
apt-get install -y libchromaprint-tools
# oppure: chromaprint-tools
```

**Verifica:**
```bash
fpcalc --version
```

### Python + ShazamIO

**Opzione A – pip globale (Debian/Ubuntu recenti):**
```bash
apt-get install -y python3 python3-pip
pip3 install --break-system-packages shazamio
```

**Opzione B – virtualenv (consigliato):**
```bash
python3 -m venv /opt/alefy/shazam_venv
/opt/alefy/shazam_venv/bin/pip install shazamio
```

Poi aggiorna lo shebang di `scripts/shazam_recognize.py`:
```bash
sed -i '1s|^#!/usr/bin/env python3|#!/opt/alefy/shazam_venv/bin/python3|' /opt/alefy/scripts/shazam_recognize.py
```

## Verifica

```bash
# fpcalc
fpcalc --version

# ShazamIO
python3 -c "import shazamio; print('OK')"
# oppure con venv:
/opt/alefy/shazam_venv/bin/python3 -c "import shazamio; print('OK')"
```

## Errori comuni

| Errore | Soluzione |
|--------|-----------|
| `fpcalc: not found` | Installa chromaprint: `apt-get install libchromaprint-tools` |
| `Shazam non disponibile` | Installa ShazamIO: `pip3 install shazamio` o usa lo script `install-metadata-deps.sh` |
| `externally-managed-environment` (pip) | Usa `pip3 install --break-system-packages shazamio` oppure un virtualenv |

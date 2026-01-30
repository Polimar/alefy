#!/bin/bash

# Script per testare yt-dlp con diverse configurazioni
# Esegui sul server: bash scripts/test-yt-dlp.sh

set -e

URL="https://www.youtube.com/watch?v=zUzd9KyIDrM"
COOKIES_FILE="/opt/alefy/storage/youtube_cookies/cookies-1763738321439.txt"
YTDLP_PATH="/usr/local/bin/yt-dlp"

echo "=== Test yt-dlp Download ==="
echo "URL: $URL"
echo "Cookies: $COOKIES_FILE"
echo "yt-dlp: $YTDLP_PATH"
echo ""

# Verifica yt-dlp
if [ ! -f "$YTDLP_PATH" ]; then
    echo "ERRORE: yt-dlp non trovato in $YTDLP_PATH"
    YTDLP_PATH=$(which yt-dlp 2>/dev/null || echo "yt-dlp")
    echo "Provo con: $YTDLP_PATH"
fi

# Verifica cookies
if [ ! -f "$COOKIES_FILE" ]; then
    echo "ERRORE: File cookies non trovato: $COOKIES_FILE"
    exit 1
fi

echo "Versione yt-dlp:"
$YTDLP_PATH --version
echo ""

# Test 1: Solo formato 140 senza cookies
echo "=== TEST 1: Formato 140 senza cookies ==="
$YTDLP_PATH "$URL" --format 140 --dump-json --no-playlist 2>&1 | head -20 || echo "FALLITO"
echo ""

# Test 2: Formato 140 con cookies
echo "=== TEST 2: Formato 140 con cookies ==="
$YTDLP_PATH --cookies "$COOKIES_FILE" "$URL" --format 140 --dump-json --no-playlist 2>&1 | head -20 || echo "FALLITO"
echo ""

# Test 3: bestaudio con cookies
echo "=== TEST 3: bestaudio con cookies ==="
$YTDLP_PATH --cookies "$COOKIES_FILE" "$URL" --format bestaudio --dump-json --no-playlist 2>&1 | head -20 || echo "FALLITO"
echo ""

# Test 4: bestaudio senza cookies
echo "=== TEST 4: bestaudio senza cookies ==="
$YTDLP_PATH "$URL" --format bestaudio --dump-json --no-playlist 2>&1 | head -20 || echo "FALLITO"
echo ""

# Test 5: bestaudio/best con cookies (fallback)
echo "=== TEST 5: bestaudio/best con cookies ==="
$YTDLP_PATH --cookies "$COOKIES_FILE" "$URL" --format "bestaudio/best" --dump-json --no-playlist 2>&1 | head -20 || echo "FALLITO"
echo ""

# Test 6: Lista formati disponibili
echo "=== TEST 6: Lista formati disponibili (con cookies) ==="
$YTDLP_PATH --cookies "$COOKIES_FILE" "$URL" --list-formats --no-playlist 2>&1 | head -50 || echo "FALLITO"
echo ""

# Test 7: Download formato 140 (solo audio, estrae in mp3)
echo "=== TEST 7: Download formato 140 con cookies (estrazione audio) ==="
cd /tmp
rm -f test_140.* 2>/dev/null
$YTDLP_PATH --cookies "$COOKIES_FILE" "$URL" --format 140 -x --audio-format mp3 --audio-quality 192K -o "test_140.%(ext)s" --no-playlist 2>&1 | tail -30 || echo "FALLITO"
ls -lh /tmp/test_140.* 2>/dev/null || echo "File non creato"
echo ""

# Test 8: Download formato 18 (video+audio combinato)
echo "=== TEST 8: Download formato 18 con cookies (video+audio) ==="
cd /tmp
rm -f test_18.* 2>/dev/null
$YTDLP_PATH --cookies "$COOKIES_FILE" "$URL" --format 18 -x --audio-format mp3 --audio-quality 192K -o "test_18.%(ext)s" --no-playlist 2>&1 | tail -30 || echo "FALLITO"
ls -lh /tmp/test_18.* 2>/dev/null || echo "File non creato"
echo ""

echo "=== Fine test ==="

#!/usr/bin/env python3
"""
Script per riconoscere audio usando ShazamIO
"""
import sys
import json
import os
from pathlib import Path

try:
    from shazamio import Shazam
    import asyncio
except ImportError:
    print(json.dumps({"error": "ShazamIO non installato. Esegui: pip3 install shazamio"}))
    sys.exit(1)


async def recognize_audio(audio_path):
    """Riconosce un file audio usando Shazam"""
    if not os.path.exists(audio_path):
        return {"error": f"File non trovato: {audio_path}"}
    
    try:
        shazam = Shazam()
        result = await shazam.recognize_song(audio_path)
        
        if not result or 'track' not in result:
            return {"error": "Nessun risultato trovato"}
        
        track = result.get('track', {})
        metadata = result.get('track', {}).get('metadata', {})
        
        # Estrai metadati
        title = track.get('title', '')
        subtitle = track.get('subtitle', '')  # Artista
        genres = track.get('genres', {}).get('primary', '')
        
        # Prova a ottenere più informazioni dai metadati
        artist = subtitle or metadata.get('artists', [{}])[0].get('name', '') if metadata.get('artists') else ''
        album = metadata.get('album', {}).get('name', '') if metadata.get('album') else ''
        year = metadata.get('release_date', '')[:4] if metadata.get('release_date') else None
        
        return {
            "success": True,
            "title": title,
            "artist": artist,
            "album": album,
            "genre": genres,
            "year": int(year) if year and year.isdigit() else None,
            "source": "shazam"
        }
    except Exception as e:
        return {"error": str(e)}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 shazam_recognize.py <audio_file_path>"}))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    result = asyncio.run(recognize_audio(audio_path))
    print(json.dumps(result))


if __name__ == "__main__":
    main()


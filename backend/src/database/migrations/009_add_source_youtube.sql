-- Migration: Add source_youtube_url column for deduplication
-- Created: 2025-02-26
-- Description: Colonna per tracciare l'URL YouTube di origine, permette dedup globale

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS source_youtube_url VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_tracks_source_youtube ON tracks(source_youtube_url) WHERE source_youtube_url IS NOT NULL;

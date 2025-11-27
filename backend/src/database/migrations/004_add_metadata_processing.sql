-- Migration: Add metadata processing columns
-- Created: 2025-11-27
-- Description: Aggiunge colonne per tracciare il processing dei metadati e la fonte

-- Aggiungi colonne per metadata processing
ALTER TABLE tracks 
ADD COLUMN IF NOT EXISTS metadata_processed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS metadata_source VARCHAR(50),
ADD COLUMN IF NOT EXISTS acoustid VARCHAR(100);

-- Crea indice per query efficienti su tracce non processate
CREATE INDEX IF NOT EXISTS idx_tracks_metadata_processed ON tracks(metadata_processed_at) WHERE metadata_processed_at IS NULL;

-- Crea indice per acoustid
CREATE INDEX IF NOT EXISTS idx_tracks_acoustid ON tracks(acoustid) WHERE acoustid IS NOT NULL;


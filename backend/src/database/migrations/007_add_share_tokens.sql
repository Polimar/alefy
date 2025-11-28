-- Tabella per token di condivisione guest
CREATE TABLE IF NOT EXISTS share_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('track', 'playlist')),
    resource_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_resource_type ON share_tokens(resource_type);
CREATE INDEX IF NOT EXISTS idx_share_tokens_resource_id ON share_tokens(resource_id);
CREATE INDEX IF NOT EXISTS idx_share_tokens_created_by ON share_tokens(created_by);


-- Tabella per salvare cookies YouTube
CREATE TABLE IF NOT EXISTS youtube_cookies (
    id SERIAL PRIMARY KEY,
    cookies_file_path VARCHAR(1000) NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    description TEXT
);

CREATE INDEX idx_youtube_cookies_active ON youtube_cookies(is_active);
CREATE INDEX idx_youtube_cookies_uploaded_by ON youtube_cookies(uploaded_by);


-- MIGRATION 010: Analitica basica de visitas web

CREATE TABLE IF NOT EXISTS analytics_visits (
    id SERIAL PRIMARY KEY,
    visitor_id VARCHAR(120) NOT NULL,
    session_id VARCHAR(120) NOT NULL,
    page_path VARCHAR(255) NOT NULL,
    page_type VARCHAR(60) NOT NULL DEFAULT 'web',
    page_label VARCHAR(160),
    entity_id INTEGER,
    torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
    referrer TEXT,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_visits_created_at
    ON analytics_visits(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_visits_page_type
    ON analytics_visits(page_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_visits_page_path
    ON analytics_visits(page_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_visits_entity
    ON analytics_visits(entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_visits_torneo
    ON analytics_visits(torneo_id, created_at DESC);

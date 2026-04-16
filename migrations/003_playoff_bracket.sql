-- ============================================================
-- MIGRATION 003: Playoff bracket estructurado
-- Fecha: 2026-04-16
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS playoff_brackets (
    id SERIAL PRIMARY KEY,
    torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
    nombre VARCHAR(120) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_final DATE NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'programado',
    campeon_equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
    campeon_nombre VARCHAR(120),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playoff_games (
    id SERIAL PRIMARY KEY,
    bracket_id INTEGER NOT NULL REFERENCES playoff_brackets(id) ON DELETE CASCADE,
    ronda VARCHAR(30) NOT NULL,
    slot VARCHAR(12) NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    seed_local INTEGER,
    equipo_local_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
    equipo_local_nombre VARCHAR(120),
    seed_visitante INTEGER,
    equipo_visitante_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
    equipo_visitante_nombre VARCHAR(120),
    carreras_local INTEGER,
    carreras_visitante INTEGER,
    ganador_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
    ganador_nombre VARCHAR(120),
    fecha DATE,
    hora TIME,
    estado VARCHAR(30) NOT NULL DEFAULT 'programado',
    innings_jugados INTEGER DEFAULT 7,
    mvp_jugador_id INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
    resumen TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (bracket_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_playoff_games_bracket ON playoff_games(bracket_id);
CREATE INDEX IF NOT EXISTS idx_playoff_games_ronda ON playoff_games(bracket_id, ronda, orden);
CREATE INDEX IF NOT EXISTS idx_playoff_brackets_torneo ON playoff_brackets(torneo_id);

COMMIT;

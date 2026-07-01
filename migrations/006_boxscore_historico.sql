ALTER TABLE partidos
    ADD COLUMN IF NOT EXISTS torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS partido_jugador_ofensiva (
    id SERIAL PRIMARY KEY,
    partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
    batting_order INTEGER,
    plate_appearances INTEGER NOT NULL DEFAULT 0,
    at_bats INTEGER NOT NULL DEFAULT 0,
    hits INTEGER NOT NULL DEFAULT 0,
    singles INTEGER NOT NULL DEFAULT 0,
    doubles INTEGER NOT NULL DEFAULT 0,
    triples INTEGER NOT NULL DEFAULT 0,
    home_runs INTEGER NOT NULL DEFAULT 0,
    rbi INTEGER NOT NULL DEFAULT 0,
    runs INTEGER NOT NULL DEFAULT 0,
    walks INTEGER NOT NULL DEFAULT 0,
    strikeouts INTEGER NOT NULL DEFAULT 0,
    stolen_bases INTEGER NOT NULL DEFAULT 0,
    caught_stealing INTEGER NOT NULL DEFAULT 0,
    hit_by_pitch INTEGER NOT NULL DEFAULT 0,
    sacrifice_flies INTEGER NOT NULL DEFAULT 0,
    sacrifice_hits INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (partido_id, jugador_id)
);

CREATE TABLE IF NOT EXISTS partido_jugador_pitcheo (
    id SERIAL PRIMARY KEY,
    partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
    innings_pitched NUMERIC(6,2) NOT NULL DEFAULT 0,
    hits_allowed INTEGER NOT NULL DEFAULT 0,
    earned_runs INTEGER NOT NULL DEFAULT 0,
    strikeouts INTEGER NOT NULL DEFAULT 0,
    walks_allowed INTEGER NOT NULL DEFAULT 0,
    home_runs_allowed INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    saves INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (partido_id, jugador_id)
);

CREATE TABLE IF NOT EXISTS partido_jugador_defensa (
    id SERIAL PRIMARY KEY,
    partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
    posicion VARCHAR(10),
    putouts INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    double_plays INTEGER NOT NULL DEFAULT 0,
    passed_balls INTEGER NOT NULL DEFAULT 0,
    chances INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (partido_id, jugador_id)
);

CREATE INDEX IF NOT EXISTS idx_pjo_partido_id ON partido_jugador_ofensiva(partido_id);
CREATE INDEX IF NOT EXISTS idx_pjo_jugador_id ON partido_jugador_ofensiva(jugador_id);
CREATE INDEX IF NOT EXISTS idx_pjo_equipo_id ON partido_jugador_ofensiva(equipo_id);
CREATE INDEX IF NOT EXISTS idx_pjo_torneo_id ON partido_jugador_ofensiva(torneo_id);

CREATE INDEX IF NOT EXISTS idx_pjp_partido_id ON partido_jugador_pitcheo(partido_id);
CREATE INDEX IF NOT EXISTS idx_pjp_jugador_id ON partido_jugador_pitcheo(jugador_id);
CREATE INDEX IF NOT EXISTS idx_pjp_equipo_id ON partido_jugador_pitcheo(equipo_id);
CREATE INDEX IF NOT EXISTS idx_pjp_torneo_id ON partido_jugador_pitcheo(torneo_id);

CREATE INDEX IF NOT EXISTS idx_pjd_partido_id ON partido_jugador_defensa(partido_id);
CREATE INDEX IF NOT EXISTS idx_pjd_jugador_id ON partido_jugador_defensa(jugador_id);
CREATE INDEX IF NOT EXISTS idx_pjd_equipo_id ON partido_jugador_defensa(equipo_id);
CREATE INDEX IF NOT EXISTS idx_pjd_torneo_id ON partido_jugador_defensa(torneo_id);

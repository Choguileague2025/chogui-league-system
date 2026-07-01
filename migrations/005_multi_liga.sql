CREATE TABLE IF NOT EXISTS ligas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) UNIQUE NOT NULL,
    descripcion TEXT,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS divisiones (
    id SERIAL PRIMARY KEY,
    liga_id INTEGER NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (liga_id, nombre)
);

ALTER TABLE torneos
    ADD COLUMN IF NOT EXISTS liga_id INTEGER REFERENCES ligas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS division_id INTEGER REFERENCES divisiones(id) ON DELETE SET NULL;

ALTER TABLE equipos
    ADD COLUMN IF NOT EXISTS liga_id INTEGER REFERENCES ligas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS division_id INTEGER REFERENCES divisiones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_torneos_liga_id ON torneos(liga_id);
CREATE INDEX IF NOT EXISTS idx_torneos_division_id ON torneos(division_id);
CREATE INDEX IF NOT EXISTS idx_equipos_liga_id ON equipos(liga_id);
CREATE INDEX IF NOT EXISTS idx_equipos_division_id ON equipos(division_id);

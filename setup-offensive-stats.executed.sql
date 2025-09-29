-- Crear tabla para estadísticas ofensivas (bateo)
CREATE TABLE IF NOT EXISTS estadisticas_ofensivas (
    id SERIAL PRIMARY KEY,
    jugador_id INTEGER REFERENCES jugadores(id) ON DELETE CASCADE,
    
    -- Estadísticas de bateo
    at_bats INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    home_runs INTEGER DEFAULT 0,
    rbi INTEGER DEFAULT 0,
    runs INTEGER DEFAULT 0,
    walks INTEGER DEFAULT 0,
    stolen_bases INTEGER DEFAULT 0,
    
    -- Timestamps
    fecha_registro TIMESTAMP DEFAULT NOW(),
    temporada VARCHAR(10) DEFAULT '2025',
    
    -- Constraint para evitar duplicados por jugador y temporada
    UNIQUE(jugador_id, temporada)
);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_estadisticas_ofensivas_jugador ON estadisticas_ofensivas(jugador_id);
CREATE INDEX IF NOT EXISTS idx_estadisticas_ofensivas_temporada ON estadisticas_ofensivas(temporada);

-- Agregar comentarios a la tabla
COMMENT ON TABLE estadisticas_ofensivas IS 'Estadísticas ofensivas (bateo) por jugador y temporada';

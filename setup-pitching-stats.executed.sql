-- Crear tabla para estadísticas de pitcheo
CREATE TABLE IF NOT EXISTS estadisticas_pitcheo (
    id SERIAL PRIMARY KEY,
    jugador_id INTEGER REFERENCES jugadores(id) ON DELETE CASCADE,
    -- Estadísticas básicas de pitcheo
    innings_pitched DECIMAL(4,1) DEFAULT 0, -- Innings lanzados (ej: 5.2 = 5 innings y 2 outs)
    hits_allowed INTEGER DEFAULT 0, -- Hits permitidos
    earned_runs INTEGER DEFAULT 0, -- Carreras limpias permitidas
    strikeouts INTEGER DEFAULT 0, -- Ponches
    walks_allowed INTEGER DEFAULT 0, -- Bases por bolas concedidas
    home_runs_allowed INTEGER DEFAULT 0, -- Home runs permitidos
    
    -- Estadísticas de juegos
    wins INTEGER DEFAULT 0, -- Victorias
    losses INTEGER DEFAULT 0, -- Derrotas
    saves INTEGER DEFAULT 0, -- Salvamentos
    games_started INTEGER DEFAULT 0, -- Juegos iniciados
    games_finished INTEGER DEFAULT 0, -- Juegos terminados
    complete_games INTEGER DEFAULT 0, -- Juegos completos
    shutouts INTEGER DEFAULT 0, -- Blanqueadas
    
    -- Estadísticas adicionales
    hit_batters INTEGER DEFAULT 0, -- Bateadores golpeados
    wild_pitches INTEGER DEFAULT 0, -- Lanzamientos salvajes
    balks INTEGER DEFAULT 0, -- Balks
    
    -- Timestamps
    fecha_registro TIMESTAMP DEFAULT NOW(),
    temporada VARCHAR(10) DEFAULT '2025',
    
    -- Constraint para evitar duplicados por jugador y temporada
    UNIQUE(jugador_id, temporada)
);

-- Crear tabla para estadísticas defensivas
CREATE TABLE IF NOT EXISTS estadisticas_defensivas (
    id SERIAL PRIMARY KEY,
    jugador_id INTEGER REFERENCES jugadores(id) ON DELETE CASCADE,
    
    -- Estadísticas defensivas básicas
    putouts INTEGER DEFAULT 0, -- Eliminaciones (PO)
    assists INTEGER DEFAULT 0, -- Asistencias (A)
    errors INTEGER DEFAULT 0, -- Errores (E)
    double_plays INTEGER DEFAULT 0, -- Jugadas dobles (DP)
    
    -- Estadísticas específicas por posición
    -- Para catchers
    passed_balls INTEGER DEFAULT 0, -- Pelotas pasadas
    stolen_bases_against INTEGER DEFAULT 0, -- Bases robadas en contra
    caught_stealing INTEGER DEFAULT 0, -- Corredores atrapados robando
    
    -- Para infielders/outfielders
    chances INTEGER DEFAULT 0, -- Oportunidades (PO + A + E)
    
    -- Timestamps
    fecha_registro TIMESTAMP DEFAULT NOW(),
    temporada VARCHAR(10) DEFAULT '2025',
    
    -- Constraint para evitar duplicados por jugador y temporada
    UNIQUE(jugador_id, temporada)
);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_estadisticas_pitcheo_jugador ON estadisticas_pitcheo(jugador_id);
CREATE INDEX IF NOT EXISTS idx_estadisticas_pitcheo_temporada ON estadisticas_pitcheo(temporada);
CREATE INDEX IF NOT EXISTS idx_estadisticas_defensivas_jugador ON estadisticas_defensivas(jugador_id);
CREATE INDEX IF NOT EXISTS idx_estadisticas_defensivas_temporada ON estadisticas_defensivas(temporada);

-- Agregar comentarios a las tablas
COMMENT ON TABLE estadisticas_pitcheo IS 'Estadísticas de pitcheo por jugador y temporada';
COMMENT ON TABLE estadisticas_defensivas IS 'Estadísticas defensivas por jugador y temporada';

-- Ejemplo de función para calcular ERA (Efectividad)
-- ERA = (Carreras Limpias * 7) / Innings Lanzados (en softball son 7 innings)
CREATE OR REPLACE FUNCTION calcular_era(carreras_limpias INTEGER, innings DECIMAL)
RETURNS DECIMAL(4,2) AS $$
BEGIN
    IF innings = 0 THEN
        RETURN 0.00;
    ELSE
        RETURN ROUND((carreras_limpias * 7.0) / innings, 2);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de función para calcular WHIP
-- WHIP = (Hits Permitidos + Bases por Bolas) / Innings Lanzados
CREATE OR REPLACE FUNCTION calcular_whip(hits INTEGER, walks INTEGER, innings DECIMAL)
RETURNS DECIMAL(4,2) AS $$
BEGIN
    IF innings = 0 THEN
        RETURN 0.00;
    ELSE
        RETURN ROUND((hits + walks) / innings, 2);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de función para calcular porcentaje defensivo
-- FLD% = (PO + A) / (PO + A + E)
CREATE OR REPLACE FUNCTION calcular_fielding_percentage(putouts INTEGER, assists INTEGER, errors INTEGER)
RETURNS DECIMAL(4,3) AS $$
BEGIN
    IF (putouts + assists + errors) = 0 THEN
        RETURN 1.000;
    ELSE
        RETURN ROUND((putouts + assists)::DECIMAL / (putouts + assists + errors), 3);
    END IF;
END;
$$ LANGUAGE plpgsql;

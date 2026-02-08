-- ============================================================
-- MIGRATION 001: temporada (VARCHAR) -> torneo_id (INTEGER FK)
-- Fecha: 2026-02-08
-- Tablas afectadas: estadisticas_ofensivas, estadisticas_pitcheo, estadisticas_defensivas
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1: Crear torneos para cada valor unico de "temporada"
-- Valor encontrado: "2024" (unico valor en las 3 tablas)
-- ============================================================

INSERT INTO torneos (nombre, fecha_inicio, activo, total_juegos, cupos_playoffs)
SELECT
    'Temporada ' || t.temporada_val,
    '2024-01-01'::timestamp,
    false,
    22,
    8
FROM (
    SELECT DISTINCT temporada AS temporada_val
    FROM estadisticas_ofensivas
    UNION
    SELECT DISTINCT temporada AS temporada_val
    FROM estadisticas_pitcheo
    UNION
    SELECT DISTINCT temporada AS temporada_val
    FROM estadisticas_defensivas
) t
WHERE NOT EXISTS (
    SELECT 1 FROM torneos WHERE nombre = 'Temporada ' || t.temporada_val
);

-- ============================================================
-- PASO 2: Agregar columna torneo_id (nullable inicialmente)
-- ============================================================

ALTER TABLE estadisticas_ofensivas ADD COLUMN torneo_id INTEGER;
ALTER TABLE estadisticas_pitcheo ADD COLUMN torneo_id INTEGER;
ALTER TABLE estadisticas_defensivas ADD COLUMN torneo_id INTEGER;

-- ============================================================
-- PASO 3: Poblar torneo_id mapeando temporada -> torneos.id
-- ============================================================

UPDATE estadisticas_ofensivas eo
SET torneo_id = t.id
FROM torneos t
WHERE t.nombre = 'Temporada ' || eo.temporada;

UPDATE estadisticas_pitcheo ep
SET torneo_id = t.id
FROM torneos t
WHERE t.nombre = 'Temporada ' || ep.temporada;

UPDATE estadisticas_defensivas ed
SET torneo_id = t.id
FROM torneos t
WHERE t.nombre = 'Temporada ' || ed.temporada;

-- ============================================================
-- PASO 4: Verificar que NO quedan NULLs en torneo_id
-- (Si hay NULLs, la transaccion fallara en el ALTER NOT NULL)
-- ============================================================

DO $$
DECLARE
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count
    FROM estadisticas_ofensivas WHERE torneo_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'ABORT: % registros con torneo_id NULL en estadisticas_ofensivas', null_count;
    END IF;

    SELECT COUNT(*) INTO null_count
    FROM estadisticas_pitcheo WHERE torneo_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'ABORT: % registros con torneo_id NULL en estadisticas_pitcheo', null_count;
    END IF;

    SELECT COUNT(*) INTO null_count
    FROM estadisticas_defensivas WHERE torneo_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'ABORT: % registros con torneo_id NULL en estadisticas_defensivas', null_count;
    END IF;

    RAISE NOTICE 'CHECK OK: Cero NULLs en torneo_id en las 3 tablas';
END $$;

-- ============================================================
-- PASO 5: Eliminar constraints UNIQUE antiguos (jugador_id + temporada)
-- ============================================================

ALTER TABLE estadisticas_ofensivas DROP CONSTRAINT IF EXISTS estadisticas_ofensivas_jugador_id_temporada_key;
ALTER TABLE estadisticas_pitcheo DROP CONSTRAINT IF EXISTS estadisticas_pitcheo_jugador_id_temporada_key;
ALTER TABLE estadisticas_defensivas DROP CONSTRAINT IF EXISTS estadisticas_defensivas_jugador_id_temporada_key;

-- ============================================================
-- PASO 6: Hacer torneo_id NOT NULL
-- ============================================================

ALTER TABLE estadisticas_ofensivas ALTER COLUMN torneo_id SET NOT NULL;
ALTER TABLE estadisticas_pitcheo ALTER COLUMN torneo_id SET NOT NULL;
ALTER TABLE estadisticas_defensivas ALTER COLUMN torneo_id SET NOT NULL;

-- ============================================================
-- PASO 7: Agregar FOREIGN KEYs a torneos
-- ============================================================

ALTER TABLE estadisticas_ofensivas
    ADD CONSTRAINT fk_stats_ofensivas_torneo
    FOREIGN KEY (torneo_id) REFERENCES torneos(id) ON DELETE CASCADE;

ALTER TABLE estadisticas_pitcheo
    ADD CONSTRAINT fk_stats_pitcheo_torneo
    FOREIGN KEY (torneo_id) REFERENCES torneos(id) ON DELETE CASCADE;

ALTER TABLE estadisticas_defensivas
    ADD CONSTRAINT fk_stats_defensivas_torneo
    FOREIGN KEY (torneo_id) REFERENCES torneos(id) ON DELETE CASCADE;

-- ============================================================
-- PASO 8: Eliminar columna temporada
-- ============================================================

ALTER TABLE estadisticas_ofensivas DROP COLUMN temporada;
ALTER TABLE estadisticas_pitcheo DROP COLUMN temporada;
ALTER TABLE estadisticas_defensivas DROP COLUMN temporada;

-- ============================================================
-- PASO 9: Nuevos UNIQUE constraints (jugador_id + torneo_id)
-- ============================================================

ALTER TABLE estadisticas_ofensivas
    ADD CONSTRAINT unique_jugador_torneo_ofensivas UNIQUE (jugador_id, torneo_id);

ALTER TABLE estadisticas_pitcheo
    ADD CONSTRAINT unique_jugador_torneo_pitcheo UNIQUE (jugador_id, torneo_id);

ALTER TABLE estadisticas_defensivas
    ADD CONSTRAINT unique_jugador_torneo_defensivas UNIQUE (jugador_id, torneo_id);

-- ============================================================
-- PASO 10: Indices para performance
-- ============================================================

CREATE INDEX idx_stats_ofensivas_torneo ON estadisticas_ofensivas(torneo_id);
CREATE INDEX idx_stats_pitcheo_torneo ON estadisticas_pitcheo(torneo_id);
CREATE INDEX idx_stats_defensivas_torneo ON estadisticas_defensivas(torneo_id);

COMMIT;

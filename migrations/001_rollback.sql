-- ============================================================
-- ROLLBACK 001: torneo_id (INTEGER FK) -> temporada (VARCHAR)
-- Reversa completa de 001_temporada_to_torneo.sql
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1: Agregar columna temporada de vuelta
-- ============================================================

ALTER TABLE estadisticas_ofensivas ADD COLUMN temporada VARCHAR(100) DEFAULT '2025';
ALTER TABLE estadisticas_pitcheo ADD COLUMN temporada VARCHAR(100) DEFAULT '2025';
ALTER TABLE estadisticas_defensivas ADD COLUMN temporada VARCHAR(100) DEFAULT '2025';

-- ============================================================
-- PASO 2: Restaurar datos de temporada desde torneos
-- ============================================================

UPDATE estadisticas_ofensivas eo
SET temporada = REPLACE(t.nombre, 'Temporada ', '')
FROM torneos t
WHERE t.id = eo.torneo_id;

UPDATE estadisticas_pitcheo ep
SET temporada = REPLACE(t.nombre, 'Temporada ', '')
FROM torneos t
WHERE t.id = ep.torneo_id;

UPDATE estadisticas_defensivas ed
SET temporada = REPLACE(t.nombre, 'Temporada ', '')
FROM torneos t
WHERE t.id = ed.torneo_id;

-- ============================================================
-- PASO 3: Eliminar indices de torneo_id
-- ============================================================

DROP INDEX IF EXISTS idx_stats_ofensivas_torneo;
DROP INDEX IF EXISTS idx_stats_pitcheo_torneo;
DROP INDEX IF EXISTS idx_stats_defensivas_torneo;

-- ============================================================
-- PASO 4: Eliminar UNIQUE constraints nuevos
-- ============================================================

ALTER TABLE estadisticas_ofensivas DROP CONSTRAINT IF EXISTS unique_jugador_torneo_ofensivas;
ALTER TABLE estadisticas_pitcheo DROP CONSTRAINT IF EXISTS unique_jugador_torneo_pitcheo;
ALTER TABLE estadisticas_defensivas DROP CONSTRAINT IF EXISTS unique_jugador_torneo_defensivas;

-- ============================================================
-- PASO 5: Eliminar FOREIGN KEYs
-- ============================================================

ALTER TABLE estadisticas_ofensivas DROP CONSTRAINT IF EXISTS fk_stats_ofensivas_torneo;
ALTER TABLE estadisticas_pitcheo DROP CONSTRAINT IF EXISTS fk_stats_pitcheo_torneo;
ALTER TABLE estadisticas_defensivas DROP CONSTRAINT IF EXISTS fk_stats_defensivas_torneo;

-- ============================================================
-- PASO 6: Eliminar columna torneo_id
-- ============================================================

ALTER TABLE estadisticas_ofensivas DROP COLUMN torneo_id;
ALTER TABLE estadisticas_pitcheo DROP COLUMN torneo_id;
ALTER TABLE estadisticas_defensivas DROP COLUMN torneo_id;

-- ============================================================
-- PASO 7: Restaurar UNIQUE constraints originales
-- ============================================================

ALTER TABLE estadisticas_ofensivas
    ADD CONSTRAINT estadisticas_ofensivas_jugador_id_temporada_key UNIQUE (jugador_id, temporada);

ALTER TABLE estadisticas_pitcheo
    ADD CONSTRAINT estadisticas_pitcheo_jugador_id_temporada_key UNIQUE (jugador_id, temporada);

ALTER TABLE estadisticas_defensivas
    ADD CONSTRAINT estadisticas_defensivas_jugador_id_temporada_key UNIQUE (jugador_id, temporada);

-- ============================================================
-- PASO 8: Eliminar torneo "Temporada 2024" creado por la migracion
-- (Solo si fue creado por la migracion, no eliminar torneos preexistentes)
-- ============================================================

DELETE FROM torneos WHERE nombre = 'Temporada 2024';

COMMIT;

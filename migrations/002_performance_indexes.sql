-- =============================================
-- Migration 002: Performance Indexes
-- Phase 4.2 - Optimization
-- =============================================

-- Jugadores: búsqueda por nombre y equipo
CREATE INDEX IF NOT EXISTS idx_jugadores_nombre ON jugadores(nombre);
CREATE INDEX IF NOT EXISTS idx_jugadores_equipo_activo ON jugadores(equipo_id, activo);

-- Equipos: búsqueda por nombre
CREATE INDEX IF NOT EXISTS idx_equipos_nombre ON equipos(nombre);

-- Estadísticas: queries comunes
CREATE INDEX IF NOT EXISTS idx_stats_ofensivas_avg ON estadisticas_ofensivas(avg DESC) WHERE avg IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stats_ofensivas_hr ON estadisticas_ofensivas(home_runs DESC);
CREATE INDEX IF NOT EXISTS idx_stats_pitcheo_era ON estadisticas_pitcheo(era) WHERE era IS NOT NULL;

-- Partidos: búsqueda por fecha
CREATE INDEX IF NOT EXISTS idx_partidos_fecha ON partidos(fecha DESC);

-- Compound indexes para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_stats_jugador_torneo_avg ON estadisticas_ofensivas(jugador_id, torneo_id, avg DESC);

-- Analizar tablas para actualizar estadísticas del planner
ANALYZE estadisticas_ofensivas;
ANALYZE estadisticas_pitcheo;
ANALYZE estadisticas_defensivas;
ANALYZE jugadores;
ANALYZE equipos;
ANALYZE partidos;

-- Verificar índices existentes
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

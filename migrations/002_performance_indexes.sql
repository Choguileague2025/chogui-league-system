-- =============================================
-- Migration 002: Performance Indexes
-- Phase 4.2 - Optimization
-- =============================================

-- Jugadores: búsqueda por nombre y equipo
CREATE INDEX IF NOT EXISTS idx_jugadores_nombre ON jugadores(nombre);
CREATE INDEX IF NOT EXISTS idx_jugadores_equipo ON jugadores(equipo_id);

-- Equipos: búsqueda por nombre
CREATE INDEX IF NOT EXISTS idx_equipos_nombre ON equipos(nombre);

-- Estadísticas ofensivas: queries por HR y hits (columnas reales, no calculadas)
CREATE INDEX IF NOT EXISTS idx_stats_ofensivas_hr ON estadisticas_ofensivas(home_runs DESC);
CREATE INDEX IF NOT EXISTS idx_stats_ofensivas_hits ON estadisticas_ofensivas(hits DESC) WHERE hits IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stats_ofensivas_ab ON estadisticas_ofensivas(at_bats DESC) WHERE at_bats > 0;

-- Estadísticas pitcheo: queries por innings y earned_runs
CREATE INDEX IF NOT EXISTS idx_stats_pitcheo_ip ON estadisticas_pitcheo(innings_pitched DESC) WHERE innings_pitched > 0;
CREATE INDEX IF NOT EXISTS idx_stats_pitcheo_er ON estadisticas_pitcheo(earned_runs) WHERE innings_pitched > 0;

-- Partidos: búsqueda por fecha
CREATE INDEX IF NOT EXISTS idx_partidos_fecha ON partidos(fecha_partido DESC);
CREATE INDEX IF NOT EXISTS idx_partidos_estado ON partidos(estado);

-- Compound indexes para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_stats_jugador_torneo ON estadisticas_ofensivas(jugador_id, torneo_id);
CREATE INDEX IF NOT EXISTS idx_stats_pitcheo_jugador_torneo ON estadisticas_pitcheo(jugador_id, torneo_id);
CREATE INDEX IF NOT EXISTS idx_stats_defensivas_jugador_torneo ON estadisticas_defensivas(jugador_id, torneo_id);

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

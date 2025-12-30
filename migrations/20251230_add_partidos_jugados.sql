-- Agrega columnas usadas por el código pero ausentes en algunos despliegues
ALTER TABLE IF NOT EXISTS estadisticas_ofensivas
    ADD COLUMN IF NOT EXISTS partidos_jugados INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF NOT EXISTS estadisticas_ofensivas
    ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

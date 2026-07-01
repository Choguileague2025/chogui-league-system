-- Agrega columnas usadas por el código pero ausentes en algunos despliegues
ALTER TABLE estadisticas_ofensivas
    ADD COLUMN IF NOT EXISTS partidos_jugados INTEGER NOT NULL DEFAULT 0;

ALTER TABLE estadisticas_ofensivas
    ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now();

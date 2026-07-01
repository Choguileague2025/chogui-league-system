BEGIN;

ALTER TABLE torneos
    ADD COLUMN IF NOT EXISTS estado VARCHAR(30) NOT NULL DEFAULT 'activo';

ALTER TABLE torneos
    ADD COLUMN IF NOT EXISTS visible_publico BOOLEAN NOT NULL DEFAULT true;

UPDATE torneos
SET estado = CASE
    WHEN activo = true THEN 'activo'
    WHEN estado IS NULL OR estado = '' THEN 'finalizado'
    ELSE estado
END;

UPDATE torneos
SET visible_publico = false,
    estado = 'archivado'
WHERE nombre ILIKE 'Temporada %'
   OR nombre ILIKE '%(viejo)%';

CREATE INDEX IF NOT EXISTS idx_torneos_visible_publico
    ON torneos (visible_publico, estado, activo, fecha_inicio DESC);

COMMIT;

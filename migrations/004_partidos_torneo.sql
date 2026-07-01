BEGIN;

ALTER TABLE partidos
    ADD COLUMN IF NOT EXISTS torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partidos_torneo ON partidos(torneo_id);
CREATE INDEX IF NOT EXISTS idx_partidos_torneo_estado_fecha ON partidos(torneo_id, estado, fecha_partido DESC);

WITH torneo_activo AS (
    SELECT id
    FROM torneos
    WHERE activo = true
    ORDER BY id DESC
    LIMIT 1
)
UPDATE partidos
SET torneo_id = torneo_activo.id
FROM torneo_activo
WHERE partidos.torneo_id IS NULL;

COMMIT;

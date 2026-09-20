BEGIN;

CREATE TABLE IF NOT EXISTS torneo_equipos (
    torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE RESTRICT,
    equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE RESTRICT,
    PRIMARY KEY (torneo_id, equipo_id)
);
CREATE TABLE IF NOT EXISTS torneo_jugadores (
    torneo_id INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE RESTRICT,
    equipo_id INTEGER NOT NULL,
    numero INTEGER CHECK (numero >= 0),
    posicion VARCHAR(10),
    origen VARCHAR(30) NOT NULL DEFAULT 'inscripcion',
    PRIMARY KEY (torneo_id, jugador_id),
    FOREIGN KEY (torneo_id, equipo_id) REFERENCES torneo_equipos(torneo_id, equipo_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_torneo_plantel ON torneo_jugadores(torneo_id, equipo_id);

-- Ejecutar el backfill una sola vez: nunca copiar planteles a ediciones futuras.
CREATE TABLE IF NOT EXISTS liga_migraciones (nombre TEXT PRIMARY KEY);
DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM liga_migraciones WHERE nombre = '011_planteles_por_torneo') THEN
    CREATE TEMP TABLE plantel_evidencia ON COMMIT DROP AS
    SELECT p.torneo_id, b.jugador_id, b.equipo_id
    FROM (
        SELECT partido_id, jugador_id, equipo_id FROM partido_jugador_ofensiva
        UNION SELECT partido_id, jugador_id, equipo_id FROM partido_jugador_pitcheo
        UNION SELECT partido_id, jugador_id, equipo_id FROM partido_jugador_defensa
    ) b JOIN partidos p ON p.id = b.partido_id
    WHERE p.torneo_id IS NOT NULL AND b.equipo_id IS NOT NULL;

    IF EXISTS (SELECT 1 FROM plantel_evidencia GROUP BY torneo_id, jugador_id HAVING COUNT(DISTINCT equipo_id) > 1) THEN
        RAISE EXCEPTION 'Hay jugadores con más de un equipo en un torneo histórico. Revisar boxscores antes de migrar planteles.';
    END IF;

    INSERT INTO torneo_equipos(torneo_id, equipo_id)
    SELECT torneo_id, equipo_local_id FROM partidos WHERE torneo_id IS NOT NULL
    UNION SELECT torneo_id, equipo_visitante_id FROM partidos WHERE torneo_id IS NOT NULL
    UNION SELECT torneo_id, equipo_id FROM plantel_evidencia
    UNION SELECT t.id, e.id FROM torneos t CROSS JOIN equipos e WHERE t.activo = true
    ON CONFLICT DO NOTHING;

    INSERT INTO torneo_jugadores(torneo_id, jugador_id, equipo_id, numero, posicion, origen)
    SELECT DISTINCT b.torneo_id, b.jugador_id, b.equipo_id, j.numero, j.posicion, 'boxscore'
    FROM plantel_evidencia b JOIN jugadores j ON j.id = b.jugador_id
    ON CONFLICT DO NOTHING;

    CREATE TEMP TABLE plantel_legacy ON COMMIT DROP AS
    SELECT DISTINCT s.torneo_id, j.id AS jugador_id, j.equipo_id, j.numero, j.posicion
    FROM (
        SELECT torneo_id, jugador_id FROM estadisticas_ofensivas
        UNION SELECT torneo_id, jugador_id FROM estadisticas_pitcheo
        UNION SELECT torneo_id, jugador_id FROM estadisticas_defensivas
        UNION SELECT t.id, j.id FROM torneos t CROSS JOIN jugadores j WHERE t.activo = true
    ) s JOIN jugadores j ON j.id = s.jugador_id
    WHERE s.torneo_id IS NOT NULL AND j.equipo_id IS NOT NULL;

    INSERT INTO torneo_equipos(torneo_id, equipo_id)
    SELECT DISTINCT torneo_id, equipo_id FROM plantel_legacy ON CONFLICT DO NOTHING;
    INSERT INTO torneo_jugadores(torneo_id, jugador_id, equipo_id, numero, posicion, origen)
    SELECT torneo_id, jugador_id, equipo_id, numero, posicion, 'legacy_revisar'
    FROM plantel_legacy ON CONFLICT DO NOTHING;
    INSERT INTO liga_migraciones VALUES ('011_planteles_por_torneo');
END IF;
END $$;

-- Las relaciones nuevas se verifican en cada escritura sin rechazar datos históricos
-- incompletos que no podían reconstruirse. No eliminar inscripciones usadas por stats.
DO $$
DECLARE tabla TEXT;
BEGIN
    FOREACH tabla IN ARRAY ARRAY['estadisticas_ofensivas','estadisticas_pitcheo','estadisticas_defensivas'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=tabla || '_plantel_fk' AND conrelid=tabla::regclass) THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (torneo_id,jugador_id) REFERENCES torneo_jugadores(torneo_id,jugador_id) ON DELETE RESTRICT NOT VALID', tabla, tabla || '_plantel_fk');
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='partidos_local_inscrito_fk' AND conrelid='partidos'::regclass) THEN
        ALTER TABLE partidos ADD CONSTRAINT partidos_local_inscrito_fk FOREIGN KEY (torneo_id,equipo_local_id) REFERENCES torneo_equipos(torneo_id,equipo_id) ON DELETE RESTRICT NOT VALID;
        ALTER TABLE partidos ADD CONSTRAINT partidos_visitante_inscrito_fk FOREIGN KEY (torneo_id,equipo_visitante_id) REFERENCES torneo_equipos(torneo_id,equipo_id) ON DELETE RESTRICT NOT VALID;
    END IF;
END $$;
COMMIT;

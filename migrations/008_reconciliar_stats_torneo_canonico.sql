BEGIN;

WITH source_target AS (
    SELECT
        src.id AS source_id,
        tgt.id AS target_id
    FROM torneos src
    JOIN torneos tgt
      ON tgt.nombre = regexp_replace(src.nombre, '^Temporada\\s+', '')
     AND tgt.id <> src.id
     AND tgt.nombre !~ '^Temporada\\s+'
    WHERE src.nombre ~ '^Temporada\\s+'
)
DELETE FROM estadisticas_ofensivas target_rows
USING source_target st
WHERE target_rows.torneo_id = st.target_id
  AND COALESCE(target_rows.at_bats, 0) = 0
  AND COALESCE(target_rows.hits, 0) = 0
  AND COALESCE(target_rows.doubles, 0) = 0
  AND COALESCE(target_rows.triples, 0) = 0
  AND COALESCE(target_rows.home_runs, 0) = 0
  AND COALESCE(target_rows.rbi, 0) = 0
  AND COALESCE(target_rows.runs, 0) = 0
  AND COALESCE(target_rows.walks, 0) = 0
  AND COALESCE(target_rows.strikeouts, 0) = 0
  AND COALESCE(target_rows.stolen_bases, 0) = 0
  AND COALESCE(target_rows.caught_stealing, 0) = 0
  AND COALESCE(target_rows.hit_by_pitch, 0) = 0
  AND COALESCE(target_rows.sacrifice_flies, 0) = 0
  AND COALESCE(target_rows.sacrifice_hits, 0) = 0;

WITH source_target AS (
    SELECT
        src.id AS source_id,
        tgt.id AS target_id
    FROM torneos src
    JOIN torneos tgt
      ON tgt.nombre = regexp_replace(src.nombre, '^Temporada\\s+', '')
     AND tgt.id <> src.id
     AND tgt.nombre !~ '^Temporada\\s+'
    WHERE src.nombre ~ '^Temporada\\s+'
)
DELETE FROM estadisticas_pitcheo target_rows
USING source_target st
WHERE target_rows.torneo_id = st.target_id
  AND COALESCE(target_rows.innings_pitched, 0) = 0
  AND COALESCE(target_rows.hits_allowed, 0) = 0
  AND COALESCE(target_rows.earned_runs, 0) = 0
  AND COALESCE(target_rows.strikeouts, 0) = 0
  AND COALESCE(target_rows.walks_allowed, 0) = 0
  AND COALESCE(target_rows.home_runs_allowed, 0) = 0
  AND COALESCE(target_rows.wins, 0) = 0
  AND COALESCE(target_rows.losses, 0) = 0
  AND COALESCE(target_rows.saves, 0) = 0;

WITH source_target AS (
    SELECT
        src.id AS source_id,
        tgt.id AS target_id
    FROM torneos src
    JOIN torneos tgt
      ON tgt.nombre = regexp_replace(src.nombre, '^Temporada\\s+', '')
     AND tgt.id <> src.id
     AND tgt.nombre !~ '^Temporada\\s+'
    WHERE src.nombre ~ '^Temporada\\s+'
)
DELETE FROM estadisticas_defensivas target_rows
USING source_target st
WHERE target_rows.torneo_id = st.target_id
  AND COALESCE(target_rows.putouts, 0) = 0
  AND COALESCE(target_rows.assists, 0) = 0
  AND COALESCE(target_rows.errors, 0) = 0
  AND COALESCE(target_rows.double_plays, 0) = 0
  AND COALESCE(target_rows.passed_balls, 0) = 0
  AND COALESCE(target_rows.chances, 0) = 0;

WITH source_target AS (
    SELECT
        src.id AS source_id,
        tgt.id AS target_id
    FROM torneos src
    JOIN torneos tgt
      ON tgt.nombre = regexp_replace(src.nombre, '^Temporada\\s+', '')
     AND tgt.id <> src.id
     AND tgt.nombre !~ '^Temporada\\s+'
    WHERE src.nombre ~ '^Temporada\\s+'
)
UPDATE estadisticas_ofensivas eo
SET torneo_id = st.target_id
FROM source_target st
WHERE eo.torneo_id = st.source_id;

WITH source_target AS (
    SELECT
        src.id AS source_id,
        tgt.id AS target_id
    FROM torneos src
    JOIN torneos tgt
      ON tgt.nombre = regexp_replace(src.nombre, '^Temporada\\s+', '')
     AND tgt.id <> src.id
     AND tgt.nombre !~ '^Temporada\\s+'
    WHERE src.nombre ~ '^Temporada\\s+'
)
UPDATE estadisticas_pitcheo ep
SET torneo_id = st.target_id
FROM source_target st
WHERE ep.torneo_id = st.source_id;

WITH source_target AS (
    SELECT
        src.id AS source_id,
        tgt.id AS target_id
    FROM torneos src
    JOIN torneos tgt
      ON tgt.nombre = regexp_replace(src.nombre, '^Temporada\\s+', '')
     AND tgt.id <> src.id
     AND tgt.nombre !~ '^Temporada\\s+'
    WHERE src.nombre ~ '^Temporada\\s+'
)
UPDATE estadisticas_defensivas ed
SET torneo_id = st.target_id
FROM source_target st
WHERE ed.torneo_id = st.source_id;

COMMIT;

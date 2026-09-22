ALTER TABLE torneos
    ADD COLUMN IF NOT EXISTS min_partidos_premios INTEGER,
    ADD COLUMN IF NOT EXISTS min_pa_bateo INTEGER;

UPDATE torneos
SET total_juegos = 5,
    min_partidos_premios = COALESCE(min_partidos_premios, 2),
    min_pa_bateo = COALESCE(min_pa_bateo, 10)
WHERE LOWER(nombre) = 'torneo tradicional'
  AND (total_juegos <> 5 OR min_partidos_premios IS NULL OR min_pa_bateo IS NULL);

UPDATE torneos
SET total_juegos = 6,
    min_partidos_premios = COALESCE(min_partidos_premios, 3),
    min_pa_bateo = COALESCE(min_pa_bateo, 10)
WHERE LOWER(nombre) = 'bola puesta'
  AND (total_juegos <> 6 OR min_partidos_premios IS NULL OR min_pa_bateo IS NULL);

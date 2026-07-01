const pool = require('../config/database');
const cache = require('../utils/cache');
const estadisticasService = require('../services/estadisticas.service');
const campeonesService = require('../services/campeones.service');
const { resolveTorneoId, obtenerCriteriosElegibilidad } = require('../services/torneos.service');
const { hasColumn, hasTable } = require('../utils/schema');

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function qualifyByThreshold(rows, key, fallbackThreshold) {
    const candidates = (Array.isArray(rows) ? rows : []).filter((row) => toNumber(row[key]) > 0);
    if (!candidates.length) return { qualified: [], threshold: 0 };
    const threshold = fallbackThreshold;
    const qualified = candidates.filter((row) => toNumber(row[key]) >= threshold);
    return { qualified: qualified.length ? qualified : candidates, threshold };
}

// GET /api/dashboard/stats
async function obtenerStats(req, res, next) {
    try {
        const cacheKey = 'dashboard_stats';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const stats = await Promise.all([
            pool.query('SELECT COUNT(*) as total FROM equipos'),
            pool.query('SELECT COUNT(*) as total FROM jugadores'),
            pool.query('SELECT COUNT(*) as total FROM partidos'),
            pool.query('SELECT COUNT(*) as total FROM estadisticas_ofensivas WHERE at_bats > 0'),
        ]);

        const result = {
            equipos: parseInt(stats[0].rows[0].total),
            jugadores: parseInt(stats[1].rows[0].total),
            partidos: parseInt(stats[2].rows[0].total),
            jugadores_con_stats: parseInt(stats[3].rows[0].total)
        };

        cache.set(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('Error obteniendo estadísticas del dashboard:', error);
        next(error);
    }
}

// GET /api/posiciones
async function obtenerPosiciones(req, res, next) {
    try {
        const torneoIdParam = req.query.torneo_id;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const shouldFilterByTournament = hasPartidosTorneo && torneoIdParam !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneoIdParam || null) : null;
        const cacheKey = `posiciones_${torneoIdParam || (shouldFilterByTournament ? torneoIdResolved : 'all') || 'all'}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        if (shouldFilterByTournament && torneoIdResolved) {
            const matchesCheck = await pool.query(`
                SELECT
                    COUNT(*)::INT AS total_partidos,
                    COUNT(*) FILTER (WHERE estado = 'finalizado')::INT AS finalizados
                FROM partidos
                WHERE torneo_id = $1
            `, [torneoIdResolved]);
            const totals = matchesCheck.rows[0] || {};
            if (!toNumber(totals.total_partidos) || !toNumber(totals.finalizados)) {
                cache.set(cacheKey, []);
                return res.json([]);
            }
        }

        const params = [];
        const finalizadosWhere = [`estado = 'finalizado'`];

        if (shouldFilterByTournament && torneoIdResolved) {
            params.push(torneoIdResolved);
            finalizadosWhere.push(`torneo_id = $${params.length}`);
        }

        const result = await pool.query(`
            WITH finalizados AS (
                SELECT id, equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante
                FROM partidos
                WHERE ${finalizadosWhere.join(' AND ')}
            ),
            juegos AS (
                SELECT equipo_local_id AS equipo_id,
                       (carreras_local) AS cf, (carreras_visitante) AS ce,
                       CASE WHEN carreras_local > carreras_visitante THEN 1 ELSE 0 END AS gan,
                       CASE WHEN carreras_local < carreras_visitante THEN 1 ELSE 0 END AS per
                FROM finalizados
                UNION ALL
                SELECT equipo_visitante_id AS equipo_id,
                       (carreras_visitante) AS cf, (carreras_local) AS ce,
                       CASE WHEN carreras_visitante > carreras_local THEN 1 ELSE 0 END AS gan,
                       CASE WHEN carreras_visitante < carreras_local THEN 1 ELSE 0 END AS per
                FROM finalizados
            )
            SELECT e.id AS equipo_id, e.nombre AS equipo_nombre,
                   COUNT(j.equipo_id) AS pj,
                   COALESCE(SUM(j.gan),0) AS pg,
                   COALESCE(SUM(j.per),0) AS pp,
                   COALESCE(SUM(j.cf),0) AS cf,
                   COALESCE(SUM(j.ce),0) AS ce,
                   COALESCE(SUM(j.cf),0) - COALESCE(SUM(j.ce),0) AS dif,
                   CASE WHEN COUNT(j.equipo_id) = 0 THEN 0
                        ELSE ROUND(COALESCE(SUM(j.gan),0)::numeric / COUNT(j.equipo_id) * 100, 2) END AS porcentaje,
                   ROW_NUMBER() OVER (ORDER BY
                        CASE WHEN COUNT(j.equipo_id) = 0 THEN 0
                        ELSE ROUND(COALESCE(SUM(j.gan),0)::numeric / COUNT(j.equipo_id) * 100, 2) END DESC,
                        (COALESCE(SUM(j.cf),0) - COALESCE(SUM(j.ce),0)) DESC,
                        e.nombre ASC
                   ) AS ranking
            FROM equipos e
            LEFT JOIN juegos j ON j.equipo_id = e.id
            GROUP BY e.id, e.nombre
            ORDER BY porcentaje DESC, dif DESC, e.nombre ASC;
        `, params);

        cache.set(cacheKey, result.rows);
        res.json(result.rows);
    } catch (error) {
        console.error('Error calculando posiciones:', error);
        next(error);
    }
}

// GET /api/lideres
async function obtenerLideres(req, res, next) {
    try {
        const { tipo = 'bateo', min_ab, torneo_id } = req.query;
        const cacheKey = `lideres_${tipo}_${min_ab}_${torneo_id || 'auto'}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const torneoIdResolved = torneo_id && torneo_id !== 'todos' ? await resolveTorneoId(torneo_id) : null;
        const criterios = torneoIdResolved ? await obtenerCriteriosElegibilidad(torneoIdResolved) : {};

        if (tipo === 'bateo') {
            const minAtBats = min_ab !== undefined
                ? Number(min_ab)
                : (criterios.min_ab_rate_stats ?? 10);
            const rows = await estadisticasService.obtenerOfensivas({
                torneo_id,
                min_at_bats: minAtBats
            });

            const lideres = rows.slice(0, 20).map(jugador => ({
                ...jugador,
                id: jugador.id || jugador.jugador_id,
                nombre: jugador.nombre || jugador.jugador_nombre,
                equipo: jugador.equipo || jugador.equipo_nombre,
                ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3)),
                iso: parseFloat((parseFloat(jugador.slg) - parseFloat(jugador.avg)).toFixed(3))
            }));

            cache.set(cacheKey, lideres);
            res.json(lideres);

        } else if (tipo === 'pitcheo') {
            const rows = await estadisticasService.obtenerPitcheo({ torneo_id });
            const minIp = criterios.min_ip_rate_stats ?? 5;
            const lideres = rows
                .filter(jugador => Number(jugador.innings_pitched) >= minIp)
                .sort((a, b) => {
                    const eraDiff = Number(a.era) - Number(b.era);
                    if (eraDiff !== 0) return eraDiff;
                    return Number(a.whip) - Number(b.whip);
                })
                .slice(0, 20)
                .map(jugador => ({
                    ...jugador,
                    id: jugador.id || jugador.jugador_id,
                    nombre: jugador.nombre || jugador.jugador_nombre,
                    equipo: jugador.equipo || jugador.equipo_nombre
                }));

            cache.set(cacheKey, lideres);
            res.json(lideres);

        } else if (tipo === 'defensa') {
            const rows = await estadisticasService.obtenerDefensivas({ torneo_id });
            const minChances = criterios.min_chances_defense ?? 5;
            const lideres = rows
                .filter(jugador => Number(jugador.chances) >= minChances)
                .sort((a, b) => {
                    const pctDiff = Number(b.fielding_percentage) - Number(a.fielding_percentage);
                    if (pctDiff !== 0) return pctDiff;
                    return Number(b.chances) - Number(a.chances);
                })
                .slice(0, 20)
                .map(jugador => ({
                    ...jugador,
                    id: jugador.id || jugador.jugador_id,
                    nombre: jugador.nombre || jugador.jugador_nombre,
                    equipo: jugador.equipo || jugador.equipo_nombre
                }));

            cache.set(cacheKey, lideres);
            res.json(lideres);
        } else {
            res.status(400).json({ error: 'Tipo no válido. Use: bateo, pitcheo, defensa' });
        }
    } catch (error) {
        console.error('Error obteniendo líderes:', error);
        next(error);
    }
}

// GET /api/lideres-ofensivos
async function obtenerLideresOfensivos(req, res, next) {
    try {
        const { min_at_bats, torneo_id } = req.query;
        const cacheKey = `lideres_ofensivos_${min_at_bats}_${torneo_id || 'auto'}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const torneoIdResolved = torneo_id && torneo_id !== 'todos' ? await resolveTorneoId(torneo_id) : null;
        const criterios = torneoIdResolved ? await obtenerCriteriosElegibilidad(torneoIdResolved) : {};
        const minAtBats = min_at_bats !== undefined ? Number(min_at_bats) : (criterios.min_ab_rate_stats ?? 10);

        const rows = await estadisticasService.obtenerOfensivas({
            torneo_id,
            min_at_bats: minAtBats
        });

        const jugadoresConOPS = rows.map(jugador => ({
            ...jugador,
            ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3))
        }));

        cache.set(cacheKey, jugadoresConOPS);
        res.json(jugadoresConOPS);
    } catch (error) {
        console.error('Error obteniendo líderes ofensivos:', error);
        next(error);
    }
}

// GET /api/lideres-pitcheo
async function obtenerLideresPitcheo(req, res, next) {
    try {
        const { torneo_id } = req.query;
        const cacheKey = `lideres_pitcheo_${torneo_id || 'auto'}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const torneoIdResolved = torneo_id && torneo_id !== 'todos' ? await resolveTorneoId(torneo_id) : null;
        const criterios = torneoIdResolved ? await obtenerCriteriosElegibilidad(torneoIdResolved) : {};
        const minIp = criterios.min_ip_rate_stats ?? 5;

        const result = await estadisticasService.obtenerPitcheo({ torneo_id });
        const rows = result
            .filter(jugador => Number(jugador.innings_pitched) >= minIp)
            .sort((a, b) => {
                const eraDiff = Number(a.era) - Number(b.era);
                if (eraDiff !== 0) return eraDiff;
                return Number(a.whip) - Number(b.whip);
            });
        cache.set(cacheKey, rows);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo líderes de pitcheo:', error);
        next(error);
    }
}

// GET /api/lideres-defensivos
async function obtenerLideresDefensivos(req, res, next) {
    try {
        const { torneo_id } = req.query;
        const cacheKey = `lideres_defensivos_${torneo_id || 'auto'}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);
        const torneoIdResolved = torneo_id && torneo_id !== 'todos' ? await resolveTorneoId(torneo_id) : null;
        const criterios = torneoIdResolved ? await obtenerCriteriosElegibilidad(torneoIdResolved) : {};
        const minChances = criterios.min_chances_defense ?? 5;

        const result = await estadisticasService.obtenerDefensivas({ torneo_id });
        const rows = result
            .filter(jugador => Number(jugador.chances) >= minChances)
            .sort((a, b) => {
                const pctDiff = Number(b.fielding_percentage) - Number(a.fielding_percentage);
                if (pctDiff !== 0) return pctDiff;
                return Number(b.chances) - Number(a.chances);
            })
            .map(jugador => ({
                ...jugador,
                total_chances: jugador.chances
            }));
        cache.set(cacheKey, rows);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo líderes defensivos:', error);
        next(error);
    }
}

// GET /api/buscar
async function buscarUniversal(req, res, next) {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                error: 'El término de búsqueda debe tener al menos 2 caracteres'
            });
        }

        const searchTerm = `%${q.trim()}%`;

        const jugadoresQuery = await pool.query(`
            SELECT j.id, j.nombre, j.posicion, j.numero,
                   e.nombre as equipo_nombre, 'jugador' as tipo
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            WHERE j.nombre ILIKE $1
            LIMIT 5
        `, [searchTerm]);

        const equiposQuery = await pool.query(`
            SELECT id, nombre, ciudad, 'equipo' as tipo
            FROM equipos
            WHERE nombre ILIKE $1
            LIMIT 5
        `, [searchTerm]);

        res.json({
            jugadores: jugadoresQuery.rows,
            equipos: equiposQuery.rows
        });
    } catch (error) {
        console.error('Error en búsqueda universal:', error);
        next(error);
    }
}

// GET /api/dashboard/records
async function obtenerRecordsHistoricos(req, res, next) {
    try {
        const cacheKey = 'records_historicos_v1';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const hasOffensiveBoxscore = await hasTable('partido_jugador_ofensiva');

        const [bateadoresResult, pitchersResult, equiposResult, torneosResult, categorias, hallOfFameResult, bestGamesResult, bestSeasonsResult] = await Promise.all([
            pool.query(`
                SELECT
                    j.id AS jugador_id,
                    j.nombre AS jugador_nombre,
                    j.posicion,
                    MAX(e.nombre) AS equipo_nombre,
                    COALESCE(SUM(eo.at_bats), 0)::INT AS at_bats,
                    COALESCE(SUM(eo.hits), 0)::INT AS hits,
                    COALESCE(SUM(eo.home_runs), 0)::INT AS home_runs,
                    COALESCE(SUM(eo.rbi), 0)::INT AS rbi,
                    COALESCE(SUM(eo.runs), 0)::INT AS runs,
                    COALESCE(SUM(eo.walks), 0)::INT AS walks,
                    COALESCE(SUM(eo.strikeouts), 0)::INT AS strikeouts,
                    COALESCE(SUM(eo.doubles), 0)::INT AS doubles,
                    COALESCE(SUM(eo.triples), 0)::INT AS triples,
                    CASE
                        WHEN COALESCE(SUM(eo.at_bats), 0) > 0
                        THEN ROUND(COALESCE(SUM(eo.hits), 0)::numeric / SUM(eo.at_bats), 3)
                        ELSE 0
                    END AS avg,
                    CASE
                        WHEN (COALESCE(SUM(eo.at_bats), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0) + COALESCE(SUM(eo.sacrifice_flies), 0)) > 0
                        THEN ROUND(
                            (COALESCE(SUM(eo.hits), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0))::numeric /
                            NULLIF(COALESCE(SUM(eo.at_bats), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0) + COALESCE(SUM(eo.sacrifice_flies), 0), 0),
                            3
                        )
                        ELSE 0
                    END AS obp,
                    CASE
                        WHEN COALESCE(SUM(eo.at_bats), 0) > 0
                        THEN ROUND(
                            (
                                (COALESCE(SUM(eo.hits), 0) - COALESCE(SUM(eo.doubles), 0) - COALESCE(SUM(eo.triples), 0) - COALESCE(SUM(eo.home_runs), 0)) +
                                (2 * COALESCE(SUM(eo.doubles), 0)) +
                                (3 * COALESCE(SUM(eo.triples), 0)) +
                                (4 * COALESCE(SUM(eo.home_runs), 0))
                            )::numeric / SUM(eo.at_bats),
                            3
                        )
                        ELSE 0
                    END AS slg
                FROM jugadores j
                JOIN estadisticas_ofensivas eo ON eo.jugador_id = j.id
                LEFT JOIN equipos e ON e.id = j.equipo_id
                GROUP BY j.id, j.nombre, j.posicion
                HAVING COALESCE(SUM(eo.at_bats), 0) >= 20
                ORDER BY home_runs DESC, rbi DESC, avg DESC, hits DESC, j.nombre ASC
                LIMIT 10
            `),
            pool.query(`
                SELECT
                    j.id AS jugador_id,
                    j.nombre AS jugador_nombre,
                    j.posicion,
                    MAX(e.nombre) AS equipo_nombre,
                    ROUND(COALESCE(SUM(ep.innings_pitched), 0)::numeric, 1) AS innings_pitched,
                    COALESCE(SUM(ep.wins), 0)::INT AS wins,
                    COALESCE(SUM(ep.losses), 0)::INT AS losses,
                    COALESCE(SUM(ep.saves), 0)::INT AS saves,
                    COALESCE(SUM(ep.strikeouts), 0)::INT AS strikeouts,
                    COALESCE(SUM(ep.walks_allowed), 0)::INT AS walks_allowed,
                    COALESCE(SUM(ep.hits_allowed), 0)::INT AS hits_allowed,
                    CASE
                        WHEN COALESCE(SUM(ep.innings_pitched), 0) > 0
                        THEN ROUND((COALESCE(SUM(ep.earned_runs), 0)::numeric * 9) / SUM(ep.innings_pitched), 2)
                        ELSE 0
                    END AS era,
                    CASE
                        WHEN COALESCE(SUM(ep.innings_pitched), 0) > 0
                        THEN ROUND((COALESCE(SUM(ep.walks_allowed), 0) + COALESCE(SUM(ep.hits_allowed), 0))::numeric / SUM(ep.innings_pitched), 2)
                        ELSE 0
                    END AS whip
                FROM jugadores j
                JOIN estadisticas_pitcheo ep ON ep.jugador_id = j.id
                LEFT JOIN equipos e ON e.id = j.equipo_id
                GROUP BY j.id, j.nombre, j.posicion
                HAVING COALESCE(SUM(ep.innings_pitched), 0) >= 10
                ORDER BY wins DESC, era ASC, strikeouts DESC, j.nombre ASC
                LIMIT 10
            `),
            pool.query(`
                WITH juegos AS (
                    SELECT
                        p.torneo_id,
                        p.equipo_local_id AS equipo_id,
                        p.carreras_local AS carreras_favor,
                        p.carreras_visitante AS carreras_contra,
                        CASE WHEN p.carreras_local > p.carreras_visitante THEN 1 ELSE 0 END AS victoria,
                        CASE WHEN p.carreras_local < p.carreras_visitante THEN 1 ELSE 0 END AS derrota
                    FROM partidos p
                    WHERE p.estado = 'finalizado'
                    UNION ALL
                    SELECT
                        p.torneo_id,
                        p.equipo_visitante_id AS equipo_id,
                        p.carreras_visitante AS carreras_favor,
                        p.carreras_local AS carreras_contra,
                        CASE WHEN p.carreras_visitante > p.carreras_local THEN 1 ELSE 0 END AS victoria,
                        CASE WHEN p.carreras_visitante < p.carreras_local THEN 1 ELSE 0 END AS derrota
                    FROM partidos p
                    WHERE p.estado = 'finalizado'
                )
                SELECT
                    e.id AS equipo_id,
                    e.nombre AS equipo_nombre,
                    COUNT(*)::INT AS juegos,
                    COALESCE(SUM(j.victoria), 0)::INT AS victorias,
                    COALESCE(SUM(j.derrota), 0)::INT AS derrotas,
                    COALESCE(SUM(j.carreras_favor), 0)::INT AS carreras_anotadas,
                    COALESCE(SUM(j.carreras_contra), 0)::INT AS carreras_permitidas,
                    COALESCE(SUM(j.carreras_favor), 0)::INT - COALESCE(SUM(j.carreras_contra), 0)::INT AS diferencial,
                    CASE
                        WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(j.victoria), 0)::numeric / COUNT(*), 3)
                        ELSE 0
                    END AS porcentaje
                FROM juegos j
                JOIN equipos e ON e.id = j.equipo_id
                GROUP BY e.id, e.nombre
                HAVING COUNT(*) >= 5
                ORDER BY victorias DESC, porcentaje DESC, diferencial DESC, e.nombre ASC
                LIMIT 10
            `),
            pool.query(`
                SELECT
                    t.id AS torneo_id,
                    t.nombre AS torneo_nombre,
                    t.estado,
                    t.activo,
                    COUNT(DISTINCT p.id)::INT AS partidos_finalizados,
                    COUNT(DISTINCT CASE WHEN p.estado = 'programado' THEN p.id END)::INT AS partidos_programados,
                    COUNT(DISTINCT CASE WHEN p.estado = 'finalizado' THEN p.equipo_local_id END)
                      + COUNT(DISTINCT CASE WHEN p.estado = 'finalizado' THEN p.equipo_visitante_id END) AS apariciones_equipo,
                    COALESCE(SUM(CASE WHEN p.estado = 'finalizado' THEN COALESCE(p.carreras_local, 0) + COALESCE(p.carreras_visitante, 0) ELSE 0 END), 0)::INT AS carreras_totales
                FROM torneos t
                LEFT JOIN partidos p ON p.torneo_id = t.id
                GROUP BY t.id, t.nombre, t.estado, t.activo, t.fecha_inicio
                ORDER BY partidos_finalizados DESC, carreras_totales DESC, t.fecha_inicio DESC NULLS LAST, t.id DESC
                LIMIT 10
            `),
            campeonesService.obtenerLideresHistoricosCategorias(),
            pool.query(`
                WITH ofensiva AS (
                    SELECT
                        jugador_id,
                        COALESCE(SUM(at_bats), 0)::INT AS at_bats,
                        COALESCE(SUM(hits), 0)::INT AS hits,
                        COALESCE(SUM(home_runs), 0)::INT AS home_runs,
                        COALESCE(SUM(rbi), 0)::INT AS rbi,
                        COALESCE(SUM(runs), 0)::INT AS runs,
                        COALESCE(SUM(stolen_bases), 0)::INT AS stolen_bases,
                        CASE
                            WHEN COALESCE(SUM(at_bats), 0) > 0
                            THEN ROUND(COALESCE(SUM(hits), 0)::numeric / NULLIF(SUM(at_bats), 0), 3)
                            ELSE 0
                        END AS avg
                    FROM estadisticas_ofensivas
                    GROUP BY jugador_id
                ),
                pitcheo AS (
                    SELECT
                        jugador_id,
                        ROUND(COALESCE(SUM(innings_pitched), 0)::numeric, 1) AS innings_pitched,
                        COALESCE(SUM(wins), 0)::INT AS wins,
                        COALESCE(SUM(strikeouts), 0)::INT AS strikeouts,
                        COALESCE(SUM(saves), 0)::INT AS saves
                    FROM estadisticas_pitcheo
                    GROUP BY jugador_id
                )
                SELECT
                    j.id AS jugador_id,
                    j.nombre AS jugador_nombre,
                    j.posicion,
                    COALESCE(e.nombre, 'Sin equipo') AS equipo_nombre,
                    COALESCE(o.at_bats, 0)::INT AS at_bats,
                    COALESCE(o.hits, 0)::INT AS hits,
                    COALESCE(o.home_runs, 0)::INT AS home_runs,
                    COALESCE(o.rbi, 0)::INT AS rbi,
                    COALESCE(o.runs, 0)::INT AS runs,
                    COALESCE(o.stolen_bases, 0)::INT AS stolen_bases,
                    COALESCE(o.avg, 0) AS avg,
                    COALESCE(p.innings_pitched, 0) AS innings_pitched,
                    COALESCE(p.wins, 0)::INT AS wins,
                    COALESCE(p.strikeouts, 0)::INT AS strikeouts,
                    COALESCE(p.saves, 0)::INT AS saves,
                    ROUND(
                        (
                            (COALESCE(o.hits, 0) * 1.0) +
                            (COALESCE(o.home_runs, 0) * 4.0) +
                            (COALESCE(o.rbi, 0) * 1.2) +
                            (COALESCE(o.runs, 0) * 0.8) +
                            (COALESCE(o.stolen_bases, 0) * 1.0) +
                            (COALESCE(p.wins, 0) * 6.0) +
                            (COALESCE(p.strikeouts, 0) * 0.45) +
                            (COALESCE(p.saves, 0) * 5.0)
                        )::numeric,
                        1
                    ) AS legacy_score
                FROM jugadores j
                LEFT JOIN ofensiva o ON o.jugador_id = j.id
                LEFT JOIN pitcheo p ON p.jugador_id = j.id
                LEFT JOIN equipos e ON e.id = j.equipo_id
                WHERE COALESCE(o.at_bats, 0) >= 12 OR COALESCE(p.innings_pitched, 0) >= 5
                ORDER BY legacy_score DESC, COALESCE(o.hits, 0) DESC, COALESCE(o.home_runs, 0) DESC, j.nombre ASC
                LIMIT 10
            `),
            hasOffensiveBoxscore
                ? pool.query(`
                    SELECT
                        pjo.partido_id,
                        j.id AS jugador_id,
                        j.nombre AS jugador_nombre,
                        COALESCE(eq.nombre, 'Sin equipo') AS equipo_nombre,
                        COALESCE(t.nombre, 'Torneo') AS torneo_nombre,
                        p.fecha_partido,
                        CASE
                            WHEN p.equipo_local_id = pjo.equipo_id THEN COALESCE(ev.nombre, 'Rival')
                            ELSE COALESCE(el.nombre, 'Rival')
                        END AS rival_nombre,
                        COALESCE(pjo.at_bats, 0)::INT AS at_bats,
                        COALESCE(pjo.hits, 0)::INT AS hits,
                        COALESCE(pjo.doubles, 0)::INT AS doubles,
                        COALESCE(pjo.triples, 0)::INT AS triples,
                        COALESCE(pjo.home_runs, 0)::INT AS home_runs,
                        COALESCE(pjo.rbi, 0)::INT AS rbi,
                        COALESCE(pjo.runs, 0)::INT AS runs,
                        COALESCE(pjo.walks, 0)::INT AS walks,
                        COALESCE(pjo.stolen_bases, 0)::INT AS stolen_bases,
                        ROUND((
                            COALESCE(pjo.hits, 0) * 1.0 +
                            COALESCE(pjo.doubles, 0) * 0.8 +
                            COALESCE(pjo.triples, 0) * 1.4 +
                            COALESCE(pjo.home_runs, 0) * 3.0 +
                            COALESCE(pjo.rbi, 0) * 1.4 +
                            COALESCE(pjo.runs, 0) * 1.0 +
                            COALESCE(pjo.walks, 0) * 0.35 +
                            COALESCE(pjo.stolen_bases, 0) * 0.75
                        )::numeric, 2) AS performance_score
                    FROM partido_jugador_ofensiva pjo
                    JOIN partidos p ON p.id = pjo.partido_id
                    JOIN jugadores j ON j.id = pjo.jugador_id
                    LEFT JOIN equipos eq ON eq.id = pjo.equipo_id
                    LEFT JOIN equipos el ON el.id = p.equipo_local_id
                    LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
                    LEFT JOIN torneos t ON t.id = COALESCE(pjo.torneo_id, p.torneo_id)
                    WHERE p.estado = 'finalizado'
                      AND (
                        COALESCE(pjo.at_bats, 0) > 0 OR
                        COALESCE(pjo.walks, 0) > 0 OR
                        COALESCE(pjo.hit_by_pitch, 0) > 0 OR
                        COALESCE(pjo.sacrifice_flies, 0) > 0 OR
                        COALESCE(pjo.sacrifice_hits, 0) > 0
                      )
                    ORDER BY performance_score DESC, COALESCE(pjo.home_runs, 0) DESC, COALESCE(pjo.hits, 0) DESC, COALESCE(pjo.rbi, 0) DESC, p.fecha_partido DESC
                    LIMIT 10
                `)
                : Promise.resolve({ rows: [] }),
            pool.query(`
                SELECT
                    eo.torneo_id,
                    t.nombre AS torneo_nombre,
                    j.id AS jugador_id,
                    j.nombre AS jugador_nombre,
                    j.posicion,
                    MAX(e.nombre) AS equipo_nombre,
                    COALESCE(SUM(eo.at_bats), 0)::INT AS at_bats,
                    COALESCE(SUM(eo.hits), 0)::INT AS hits,
                    COALESCE(SUM(eo.home_runs), 0)::INT AS home_runs,
                    COALESCE(SUM(eo.rbi), 0)::INT AS rbi,
                    COALESCE(SUM(eo.runs), 0)::INT AS runs,
                    COALESCE(SUM(eo.walks), 0)::INT AS walks,
                    COALESCE(SUM(eo.stolen_bases), 0)::INT AS stolen_bases,
                    CASE
                        WHEN COALESCE(SUM(eo.at_bats), 0) > 0
                        THEN ROUND(COALESCE(SUM(eo.hits), 0)::numeric / NULLIF(SUM(eo.at_bats), 0), 3)
                        ELSE 0
                    END AS avg,
                    CASE
                        WHEN (COALESCE(SUM(eo.at_bats), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0) + COALESCE(SUM(eo.sacrifice_flies), 0)) > 0
                        THEN ROUND(
                            (COALESCE(SUM(eo.hits), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0))::numeric /
                            NULLIF(COALESCE(SUM(eo.at_bats), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0) + COALESCE(SUM(eo.sacrifice_flies), 0), 0),
                            3
                        )
                        ELSE 0
                    END AS obp,
                    CASE
                        WHEN COALESCE(SUM(eo.at_bats), 0) > 0
                        THEN ROUND(
                            (
                                (COALESCE(SUM(eo.hits), 0) - COALESCE(SUM(eo.doubles), 0) - COALESCE(SUM(eo.triples), 0) - COALESCE(SUM(eo.home_runs), 0)) +
                                (2 * COALESCE(SUM(eo.doubles), 0)) +
                                (3 * COALESCE(SUM(eo.triples), 0)) +
                                (4 * COALESCE(SUM(eo.home_runs), 0))
                            )::numeric / NULLIF(SUM(eo.at_bats), 0),
                            3
                        )
                        ELSE 0
                    END AS slg
                FROM estadisticas_ofensivas eo
                JOIN jugadores j ON j.id = eo.jugador_id
                LEFT JOIN equipos e ON e.id = j.equipo_id
                LEFT JOIN torneos t ON t.id = eo.torneo_id
                GROUP BY eo.torneo_id, t.nombre, j.id, j.nombre, j.posicion
                HAVING COALESCE(SUM(eo.at_bats), 0) >= 8
                ORDER BY
                    (
                        CASE
                            WHEN (COALESCE(SUM(eo.at_bats), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0) + COALESCE(SUM(eo.sacrifice_flies), 0)) > 0
                            THEN ROUND(
                                (COALESCE(SUM(eo.hits), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0))::numeric /
                                NULLIF(COALESCE(SUM(eo.at_bats), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0) + COALESCE(SUM(eo.sacrifice_flies), 0), 0),
                                3
                            )
                            ELSE 0
                        END
                        +
                        CASE
                            WHEN COALESCE(SUM(eo.at_bats), 0) > 0
                            THEN ROUND(
                                (
                                    (COALESCE(SUM(eo.hits), 0) - COALESCE(SUM(eo.doubles), 0) - COALESCE(SUM(eo.triples), 0) - COALESCE(SUM(eo.home_runs), 0)) +
                                    (2 * COALESCE(SUM(eo.doubles), 0)) +
                                    (3 * COALESCE(SUM(eo.triples), 0)) +
                                    (4 * COALESCE(SUM(eo.home_runs), 0))
                                )::numeric / NULLIF(SUM(eo.at_bats), 0),
                                3
                            )
                            ELSE 0
                        END
                    ) DESC,
                    COALESCE(SUM(eo.home_runs), 0) DESC,
                    COALESCE(SUM(eo.hits), 0) DESC,
                    j.nombre ASC
                LIMIT 10
            `)
        ]);

        const bateadores = bateadoresResult.rows.map((row) => ({
            ...row,
            ops: Number((Number(row.obp || 0) + Number(row.slg || 0)).toFixed(3))
        }));

        const result = {
            bateadores,
            pitchers: pitchersResult.rows,
            equipos: equiposResult.rows,
            categorias,
            hall_of_fame: hallOfFameResult.rows,
            mejores_actuaciones: bestGamesResult.rows,
            mejores_temporadas: bestSeasonsResult.rows.map((row) => ({
                ...row,
                ops: Number((Number(row.obp || 0) + Number(row.slg || 0)).toFixed(3))
            })),
            torneos: torneosResult.rows.map((row) => ({
                ...row,
                apariciones_equipo: Math.floor(Number(row.apariciones_equipo || 0) / 2)
            }))
        };

        cache.set(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('Error obteniendo récords históricos:', error);
        next(error);
    }
}

// GET /api/dashboard/campeones-posicion
async function obtenerCampeonesPosicion(req, res, next) {
    try {
        const { torneo_id } = req.query;
        const [actuales, historicos] = await Promise.all([
            campeonesService.obtenerCampeonesPorPosicion(torneo_id),
            campeonesService.obtenerPalmaresHistoricoPosicional()
        ]);

        res.json({
            ...actuales,
            historicos
        });
    } catch (error) {
        console.error('Error obteniendo campeones por posición:', error);
        next(error);
    }
}

// GET /api/dashboard/premios-oficiales
async function obtenerPremiosOficiales(req, res, next) {
    try {
        const { torneo_id } = req.query;
        const data = await campeonesService.obtenerPremiosOficialesTorneo(torneo_id);
        res.json(data);
    } catch (error) {
        console.error('Error obteniendo premios oficiales:', error);
        next(error);
    }
}

module.exports = {
    obtenerStats,
    obtenerPosiciones,
    obtenerLideres,
    obtenerLideresOfensivos,
    obtenerLideresPitcheo,
    obtenerLideresDefensivos,
    buscarUniversal,
    obtenerRecordsHistoricos,
    obtenerCampeonesPosicion,
    obtenerPremiosOficiales
};

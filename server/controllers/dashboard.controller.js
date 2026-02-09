const pool = require('../config/database');

// GET /api/dashboard/stats
async function obtenerStats(req, res, next) {
    try {
        const stats = await Promise.all([
            pool.query('SELECT COUNT(*) as total FROM equipos'),
            pool.query('SELECT COUNT(*) as total FROM jugadores'),
            pool.query('SELECT COUNT(*) as total FROM partidos'),
            pool.query('SELECT COUNT(*) as total FROM estadisticas_ofensivas WHERE at_bats > 0'),
        ]);

        res.json({
            equipos: parseInt(stats[0].rows[0].total),
            jugadores: parseInt(stats[1].rows[0].total),
            partidos: parseInt(stats[2].rows[0].total),
            jugadores_con_stats: parseInt(stats[3].rows[0].total)
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas del dashboard:', error);
        next(error);
    }
}

// GET /api/posiciones
async function obtenerPosiciones(req, res, next) {
    try {
        const result = await pool.query(`
            WITH finalizados AS (
                SELECT id, equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante
                FROM partidos WHERE estado = 'finalizado'
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
            SELECT e.id, e.nombre,
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
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error calculando posiciones:', error);
        next(error);
    }
}

// GET /api/lideres
async function obtenerLideres(req, res, next) {
    try {
        const { tipo = 'bateo', min_ab = 10 } = req.query;

        if (tipo === 'bateo') {
            const query = `
                SELECT
                    j.id, j.nombre, j.posicion, e.nombre as equipo,
                    eo.at_bats, eo.hits, eo.home_runs, eo.rbi, eo.runs,
                    eo.walks, eo.stolen_bases, eo.strikeouts,
                    COALESCE(eo.doubles, 0) as doubles,
                    COALESCE(eo.triples, 0) as triples,
                    COALESCE(eo.caught_stealing, 0) as caught_stealing,
                    COALESCE(eo.hit_by_pitch, 0) as hit_by_pitch,
                    COALESCE(eo.sacrifice_flies, 0) as sacrifice_flies,
                    COALESCE(eo.sacrifice_hits, 0) as sacrifice_hits,
                    CASE WHEN eo.at_bats > 0
                        THEN ROUND(eo.hits::DECIMAL / eo.at_bats, 3)
                        ELSE 0.000 END as avg,
                    CASE WHEN (eo.at_bats + eo.walks + COALESCE(eo.hit_by_pitch, 0) + COALESCE(eo.sacrifice_flies, 0)) > 0
                        THEN ROUND((eo.hits + eo.walks + COALESCE(eo.hit_by_pitch, 0))::DECIMAL /
                                 (eo.at_bats + eo.walks + COALESCE(eo.hit_by_pitch, 0) + COALESCE(eo.sacrifice_flies, 0)), 3)
                        ELSE 0.000 END as obp,
                    CASE WHEN eo.at_bats > 0
                        THEN ROUND(((eo.hits - COALESCE(eo.doubles, 0) - COALESCE(eo.triples, 0) - eo.home_runs) +
                                  COALESCE(eo.doubles, 0) * 2 + COALESCE(eo.triples, 0) * 3 + eo.home_runs * 4)::DECIMAL / eo.at_bats, 3)
                        ELSE 0.000 END as slg,
                    (eo.hits - COALESCE(eo.doubles, 0) - COALESCE(eo.triples, 0) - eo.home_runs) as singles,
                    ((eo.hits - COALESCE(eo.doubles, 0) - COALESCE(eo.triples, 0) - eo.home_runs) +
                     COALESCE(eo.doubles, 0) * 2 + COALESCE(eo.triples, 0) * 3 + eo.home_runs * 4) as total_bases,
                    (eo.at_bats + eo.walks + COALESCE(eo.hit_by_pitch, 0) + COALESCE(eo.sacrifice_flies, 0) + COALESCE(eo.sacrifice_hits, 0)) as plate_appearances
                FROM estadisticas_ofensivas eo
                JOIN jugadores j ON eo.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE eo.at_bats >= $1
                ORDER BY avg DESC, eo.hits DESC
                LIMIT 20`;

            const result = await pool.query(query, [min_ab]);

            const lideres = result.rows.map(jugador => ({
                ...jugador,
                ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3)),
                iso: parseFloat((parseFloat(jugador.slg) - parseFloat(jugador.avg)).toFixed(3))
            }));

            res.json(lideres);

        } else if (tipo === 'pitcheo') {
            const query = `
                SELECT
                    j.id, j.nombre, j.posicion, e.nombre as equipo,
                    ep.innings_pitched, ep.earned_runs, ep.strikeouts, ep.walks_allowed,
                    ep.hits_allowed, ep.home_runs_allowed, ep.wins, ep.losses,
                    CASE WHEN ep.innings_pitched > 0
                        THEN ROUND((ep.earned_runs * 9.0) / ep.innings_pitched, 2)
                        ELSE 0.00 END as era,
                    CASE WHEN ep.innings_pitched > 0
                        THEN ROUND((ep.hits_allowed + ep.walks_allowed) / ep.innings_pitched, 2)
                        ELSE 0.00 END as whip
                FROM estadisticas_pitcheo ep
                JOIN jugadores j ON ep.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                WHERE ep.innings_pitched >= 5
                ORDER BY era ASC
                LIMIT 20`;

            const result = await pool.query(query);
            res.json(result.rows);

        } else if (tipo === 'defensa') {
            const query = `
                SELECT
                    j.id, j.nombre, j.posicion, e.nombre as equipo,
                    ed.putouts, ed.assists, ed.errors, ed.double_plays,
                    CASE WHEN (ed.putouts + ed.assists + ed.errors) > 0
                        THEN ROUND((ed.putouts + ed.assists)::DECIMAL / (ed.putouts + ed.assists + ed.errors), 3)
                        ELSE 1.000 END as fielding_percentage
                FROM estadisticas_defensivas ed
                JOIN jugadores j ON ed.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                ORDER BY fielding_percentage DESC, ed.putouts DESC
                LIMIT 20`;

            const result = await pool.query(query);
            res.json(result.rows);
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
        const { min_at_bats = 10 } = req.query;

        const result = await pool.query(`
            SELECT eo.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   ROUND(eo.hits::DECIMAL / eo.at_bats, 3) as avg,
                   ROUND((eo.hits + eo.walks)::DECIMAL / (eo.at_bats + eo.walks), 3) as obp,
                   ROUND((eo.hits + eo.home_runs * 3)::DECIMAL / eo.at_bats, 3) as slg
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON eo.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE eo.at_bats >= $1
            ORDER BY avg DESC
        `, [min_at_bats]);

        const jugadoresConOPS = result.rows.map(jugador => ({
            ...jugador,
            ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3))
        }));

        res.json(jugadoresConOPS);
    } catch (error) {
        console.error('Error obteniendo líderes ofensivos:', error);
        next(error);
    }
}

// GET /api/lideres-pitcheo
async function obtenerLideresPitcheo(req, res, next) {
    try {
        const result = await pool.query(`
            SELECT ep.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre,
                   CASE
                       WHEN ep.innings_pitched >= 5 THEN ROUND((ep.earned_runs * 9.0) / ep.innings_pitched, 2)
                       ELSE 99.99
                   END as era,
                   CASE
                       WHEN ep.innings_pitched >= 5 THEN ROUND((ep.hits_allowed + ep.walks_allowed) / ep.innings_pitched, 2)
                       ELSE 99.99
                   END as whip
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ep.innings_pitched >= 5
            ORDER BY era ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo líderes de pitcheo:', error);
        next(error);
    }
}

// GET /api/lideres-defensivos
async function obtenerLideresDefensivos(req, res, next) {
    try {
        const result = await pool.query(`
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   CASE
                       WHEN ed.chances >= 5 THEN ROUND((ed.putouts + ed.assists)::DECIMAL / ed.chances, 3)
                       ELSE 0.000
                   END as fielding_percentage,
                   ed.chances as total_chances
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ed.chances >= 5
            ORDER BY fielding_percentage DESC, ed.chances DESC
        `);
        res.json(result.rows);
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

module.exports = {
    obtenerStats,
    obtenerPosiciones,
    obtenerLideres,
    obtenerLideresOfensivos,
    obtenerLideresPitcheo,
    obtenerLideresDefensivos,
    buscarUniversal
};

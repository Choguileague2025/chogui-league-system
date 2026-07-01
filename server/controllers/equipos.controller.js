const pool = require('../config/database');
const path = require('path');
const fs = require('fs');
const { validarCrearEquipo, validarActualizarEquipo } = require('../validators/equipos.validator');
const { resolveTorneoId } = require('../services/torneos.service');
const campeonesService = require('../services/campeones.service');
const { hasColumn } = require('../utils/schema');
const { DEFAULT_PLAYOFF_SLOTS, normalizePlayoffFormat } = require('../utils/playoffFormat');

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildTeamFormSummary(rows = []) {
    return rows.reduce((acc, row) => {
        acc.juegos += 1;
        acc.victorias += toNumber(row.victoria);
        acc.derrotas += toNumber(row.derrota);
        acc.carreras_favor += toNumber(row.carreras_favor);
        acc.carreras_contra += toNumber(row.carreras_contra);
        acc.diferencial = acc.carreras_favor - acc.carreras_contra;
        acc.pct = acc.juegos > 0 ? Number((acc.victorias / acc.juegos).toFixed(3)) : 0;
        return acc;
    }, {
        juegos: 0,
        victorias: 0,
        derrotas: 0,
        carreras_favor: 0,
        carreras_contra: 0,
        diferencial: 0,
        pct: 0
    });
}

async function construirCarreraPlayoffs({ teamId, torneoIdResolved, torneoIdParam }) {
    const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
    const shouldFilterByTournament = hasPartidosTorneo && torneoIdParam !== 'todos';

    const torneoResult = torneoIdResolved
        ? await pool.query(
            `SELECT id, nombre, total_juegos, cupos_playoffs
             FROM torneos
             WHERE id = $1
             LIMIT 1`,
            [torneoIdResolved]
        )
        : await pool.query(`
            SELECT id, nombre, total_juegos, cupos_playoffs
            FROM torneos
            WHERE activo = true
            ORDER BY id DESC
            LIMIT 1
        `);

    if (!torneoResult.rows.length) {
        return {
            torneo: null,
            standings: [],
            cuposPlayoffs: DEFAULT_PLAYOFF_SLOTS,
            totalJuegos: 0,
            cutoffTeam: null
        };
    }

    const torneo = torneoResult.rows[0];
    const params = [];
    const finalizadosWhere = [`estado = 'finalizado'`];

    if (shouldFilterByTournament && torneo.id) {
        params.push(torneo.id);
        finalizadosWhere.push(`torneo_id = $${params.length}`);
    }

    const standingsResult = await pool.query(`
        WITH finalizados AS (
            SELECT id, equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante
            FROM partidos
            WHERE ${finalizadosWhere.join(' AND ')}
        ),
        juegos AS (
            SELECT equipo_local_id AS equipo_id,
                   carreras_local AS cf,
                   carreras_visitante AS ce,
                   CASE WHEN carreras_local > carreras_visitante THEN 1 ELSE 0 END AS gan,
                   CASE WHEN carreras_local < carreras_visitante THEN 1 ELSE 0 END AS per
            FROM finalizados
            UNION ALL
            SELECT equipo_visitante_id AS equipo_id,
                   carreras_visitante AS cf,
                   carreras_local AS ce,
                   CASE WHEN carreras_visitante > carreras_local THEN 1 ELSE 0 END AS gan,
                   CASE WHEN carreras_visitante < carreras_local THEN 1 ELSE 0 END AS per
            FROM finalizados
        )
        SELECT
            e.id AS equipo_id,
            e.nombre AS equipo_nombre,
            COUNT(j.equipo_id) AS pj,
            COALESCE(SUM(j.gan),0) AS pg,
            COALESCE(SUM(j.per),0) AS pp,
            COALESCE(SUM(j.cf),0) AS cf,
            COALESCE(SUM(j.ce),0) AS ce,
            COALESCE(SUM(j.cf),0) - COALESCE(SUM(j.ce),0) AS dif,
            CASE WHEN COUNT(j.equipo_id) = 0 THEN 0
                 ELSE ROUND(COALESCE(SUM(j.gan),0)::numeric / COUNT(j.equipo_id) * 100, 2) END AS porcentaje,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN COUNT(j.equipo_id) = 0 THEN 0
                    ELSE ROUND(COALESCE(SUM(j.gan),0)::numeric / COUNT(j.equipo_id) * 100, 2) END DESC,
                    (COALESCE(SUM(j.cf),0) - COALESCE(SUM(j.ce),0)) DESC,
                    e.nombre ASC
            ) AS ranking
        FROM equipos e
        LEFT JOIN juegos j ON j.equipo_id = e.id
        GROUP BY e.id, e.nombre
        ORDER BY porcentaje DESC, dif DESC, e.nombre ASC
    `, params);

    const { totalJuegos, cuposPlayoffs } = normalizePlayoffFormat({
        totalJuegos: torneo.total_juegos,
        cuposPlayoffs: torneo.cupos_playoffs,
        teamCount: standingsResult.rows.length,
        tournamentName: torneo.nombre
    });

    const standings = standingsResult.rows.map((row) => {
        const pj = toNumber(row.pj);
        const pg = toNumber(row.pg);
        const pp = toNumber(row.pp);
        const restantes = Math.max(0, totalJuegos - pj);
        return {
            equipo_id: toNumber(row.equipo_id),
            equipo_nombre: row.equipo_nombre,
            pj,
            pg,
            pp,
            cf: toNumber(row.cf),
            ce: toNumber(row.ce),
            dif: toNumber(row.dif),
            porcentaje: toNumber(row.porcentaje),
            ranking: toNumber(row.ranking),
            restantes,
            max_victorias: pg + restantes
        };
    });

    return {
        torneo,
        standings,
        cuposPlayoffs,
        totalJuegos,
        cutoffTeam: standings[cuposPlayoffs - 1] || null
    };
}

// GET /api/equipos
async function obtenerTodos(req, res, next) {
    try {
        const result = await pool.query('SELECT * FROM equipos ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo equipos:', error);
        next(error);
    }
}

// GET /api/equipos/:id
async function obtenerPorId(req, res, next) {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM equipos WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo equipo:', error);
        next(error);
    }
}

// GET /api/equipos/:id/detalles
async function obtenerDetalles(req, res, next) {
    try {
        const { id } = req.params;

        const teamResult = await pool.query('SELECT * FROM equipos WHERE id = $1', [id]);
        if (teamResult.rows.length === 0) {
            return res.status(404).json({ message: 'Equipo no encontrado' });
        }

        const rosterResult = await pool.query(
            'SELECT * FROM jugadores WHERE equipo_id = $1 ORDER BY numero ASC, nombre ASC',
            [id]
        );

        res.json({
            equipo: teamResult.rows[0],
            roster: rosterResult.rows
        });
    } catch (error) {
        console.error('Error obteniendo detalles del equipo:', error);
        next(error);
    }
}

// GET /api/equipos/:id/estadisticas/ofensivas
async function obtenerEstadisticasOfensivas(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT
                j.nombre as jugador_nombre,
                j.posicion,
                j.numero,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                COALESCE(eo.runs, 0) as runs,
                COALESCE(eo.walks, 0) as walks,
                COALESCE(eo.stolen_bases, 0) as stolen_bases,
                COALESCE(eo.strikeouts, 0) as strikeouts,
                CASE
                    WHEN COALESCE(eo.at_bats, 0) > 0 THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / eo.at_bats, 3)
                    ELSE 0.000
                END as avg
            FROM jugadores j
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE j.equipo_id = $1
            ORDER BY j.numero ASC, j.nombre ASC
        `, [id]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas ofensivas del equipo:', error);
        next(error);
    }
}

// GET /api/equipos/:id/historico
async function obtenerHistorico(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const shouldFilterByTournament = hasPartidosTorneo && torneo_id && torneo_id !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneo_id) : null;

        const equipoResult = await pool.query('SELECT * FROM equipos WHERE id = $1 LIMIT 1', [id]);
        if (equipoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        const params = [id];
        let tournamentFilter = '';
        if (shouldFilterByTournament && torneoIdResolved) {
            params.push(torneoIdResolved);
            tournamentFilter = ` AND p.torneo_id = $${params.length}`;
        }

        const careerResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE p.estado = 'finalizado')::INT AS juegos,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local > p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante > p.carreras_local)
                ))::INT AS victorias,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local < p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante < p.carreras_local)
                ))::INT AS derrotas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_local
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_visitante
                    ELSE 0
                END), 0)::INT AS carreras_anotadas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_visitante
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_local
                    ELSE 0
                END), 0)::INT AS carreras_permitidas
            FROM partidos p
            WHERE (p.equipo_local_id = $1 OR p.equipo_visitante_id = $1)
            ${tournamentFilter}
        `, params);

        const porTorneoResult = hasPartidosTorneo ? await pool.query(`
            SELECT
                t.id AS torneo_id,
                t.nombre AS torneo_nombre,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado')::INT AS juegos,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local > p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante > p.carreras_local)
                ))::INT AS victorias,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local < p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante < p.carreras_local)
                ))::INT AS derrotas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_local
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_visitante
                    ELSE 0
                END), 0)::INT AS carreras_anotadas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_visitante
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_local
                    ELSE 0
                END), 0)::INT AS carreras_permitidas
            FROM torneos t
            JOIN partidos p ON p.torneo_id = t.id
            WHERE (p.equipo_local_id = $1 OR p.equipo_visitante_id = $1)
            GROUP BY t.id, t.nombre, t.fecha_inicio
            ORDER BY t.fecha_inicio DESC NULLS LAST, t.id DESC
        `, [id]) : { rows: [] };

        const rosterResult = await pool.query(`
            SELECT COUNT(*)::INT AS total_jugadores,
                   COUNT(*) FILTER (WHERE posicion = 'P')::INT AS pitchers
            FROM jugadores
            WHERE equipo_id = $1
        `, [id]);

        const career = careerResult.rows[0];
        const games = Number(career.juegos) || 0;
        const wins = Number(career.victorias) || 0;
        const pct = games > 0 ? wins / games : 0;

        const palmares = await campeonesService.obtenerPalmaresEquipo(equipoResult.rows[0].nombre);

        res.json({
            equipo: equipoResult.rows[0],
            career: {
                ...career,
                porcentaje: Number(pct.toFixed(3)),
                diferencial: (Number(career.carreras_anotadas) || 0) - (Number(career.carreras_permitidas) || 0),
                roster: rosterResult.rows[0],
                awards: palmares
            },
            by_tournament: porTorneoResult.rows
        });
    } catch (error) {
        console.error('Error obteniendo histórico del equipo:', error);
        next(error);
    }
}

// GET /api/equipos/:id/head-to-head
async function obtenerHeadToHead(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const shouldFilterByTournament = hasPartidosTorneo && torneo_id && torneo_id !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneo_id) : null;
        const params = [id];
        let tournamentFilter = '';

        if (shouldFilterByTournament && torneoIdResolved) {
            params.push(torneoIdResolved);
            tournamentFilter = ` AND p.torneo_id = $${params.length}`;
        }

        const result = await pool.query(`
            SELECT
                CASE
                    WHEN p.equipo_local_id = $1 THEN p.equipo_visitante_id
                    ELSE p.equipo_local_id
                END AS rival_id,
                CASE
                    WHEN p.equipo_local_id = $1 THEN ev.nombre
                    ELSE el.nombre
                END AS rival_nombre,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado')::INT AS juegos,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local > p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante > p.carreras_local)
                ))::INT AS victorias,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local < p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante < p.carreras_local)
                ))::INT AS derrotas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_local
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_visitante
                    ELSE 0
                END), 0)::INT AS carreras_anotadas,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_visitante
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_local
                    ELSE 0
                END), 0)::INT AS carreras_permitidas
            FROM partidos p
            LEFT JOIN equipos el ON el.id = p.equipo_local_id
            LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
            WHERE (p.equipo_local_id = $1 OR p.equipo_visitante_id = $1)
            ${tournamentFilter}
            GROUP BY rival_id, rival_nombre
            ORDER BY victorias DESC, juegos DESC, rival_nombre ASC
        `, params);

        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo head-to-head del equipo:', error);
        next(error);
    }
}

// GET /api/equipos/:id/playoff-path
async function obtenerCaminoPlayoffs(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const shouldResolveTorneo = torneo_id && torneo_id !== 'todos';
        const torneoIdResolved = shouldResolveTorneo ? await resolveTorneoId(torneo_id) : null;

        const equipoResult = await pool.query('SELECT id, nombre FROM equipos WHERE id = $1 LIMIT 1', [id]);
        if (!equipoResult.rows.length) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        const race = await construirCarreraPlayoffs({
            teamId: Number(id),
            torneoIdResolved,
            torneoIdParam: torneo_id
        });

        const team = race.standings.find((row) => Number(row.equipo_id) === Number(id));
        if (!team) {
            return res.json({
                torneo: race.torneo,
                cupos_playoffs: race.cuposPlayoffs,
                total_juegos: race.totalJuegos,
                equipo: {
                    id: Number(id),
                    nombre: equipoResult.rows[0].nombre,
                    estado: 'sin_muestra'
                },
                corte: race.cutoffTeam,
                rivales_directos: [],
                mensaje: 'Todavía no hay partidos finalizados para medir la carrera a playoffs.'
            });
        }

        const cutoff = race.cutoffTeam;
        const belowCutoff = race.standings.slice(race.cuposPlayoffs);
        const canBePassed = team.ranking <= race.cuposPlayoffs
            ? belowCutoff.some((other) => other.max_victorias >= team.pg)
            : false;

        let estado = 'en_pelea';
        if (team.ranking <= race.cuposPlayoffs) {
            estado = canBePassed ? 'clasificando' : 'clasificado';
        } else if (cutoff && team.max_victorias < cutoff.pg) {
            estado = 'eliminado';
        }

        const winsTarget = cutoff
            ? Math.max(cutoff.pg + (team.ranking > race.cuposPlayoffs ? 1 : 0), team.pg)
            : team.pg;
        const victoriasNecesarias = Math.max(0, winsTarget - team.pg);
        const juegosDeMargen = cutoff
            ? Number(((team.pg - cutoff.pg) + ((cutoff.pp - team.pp) / 2)).toFixed(1))
            : 0;

        const projectedRival = team.ranking <= race.cuposPlayoffs && cutoff
            ? race.standings.find((row) => row.ranking === Math.max(1, race.cuposPlayoffs + 1 - team.ranking))
            : null;

        const start = Math.max(0, race.cuposPlayoffs - 2);
        const end = Math.min(race.standings.length, race.cuposPlayoffs + 2);
        const rivals = race.standings
            .slice(start, end)
            .filter((row) => Number(row.equipo_id) !== Number(id))
            .map((row) => ({
                ...row,
                delta_victorias: team.pg - row.pg,
                delta_pct: Number((team.porcentaje - row.porcentaje).toFixed(2))
            }));

        let mensaje = `${team.equipo_nombre} está fuera del corte por ahora y necesita cerrar la brecha.`;
        if (estado === 'clasificado') {
            mensaje = `${team.equipo_nombre} ya aseguró su pase si nadie puede alcanzarlo con los juegos restantes.`;
        } else if (estado === 'clasificando') {
            mensaje = `${team.equipo_nombre} está dentro de playoffs, pero todavía debe defender el corte.`;
        } else if (estado === 'eliminado') {
            mensaje = `${team.equipo_nombre} ya no tiene margen matemático para alcanzar el corte actual.`;
        }

        res.json({
            torneo: race.torneo,
            cupos_playoffs: race.cuposPlayoffs,
            total_juegos: race.totalJuegos,
            equipo: {
                id: Number(id),
                nombre: team.equipo_nombre,
                ranking: team.ranking,
                pj: team.pj,
                pg: team.pg,
                pp: team.pp,
                porcentaje: team.porcentaje,
                restantes: team.restantes,
                max_victorias: team.max_victorias,
                estado,
                victorias_necesarias: victoriasNecesarias,
                juegos_de_margen: juegosDeMargen
            },
            corte: cutoff ? {
                equipo_id: cutoff.equipo_id,
                equipo_nombre: cutoff.equipo_nombre,
                ranking: cutoff.ranking,
                pg: cutoff.pg,
                porcentaje: cutoff.porcentaje
            } : null,
            rival_proyectado: projectedRival ? {
                equipo_id: projectedRival.equipo_id,
                equipo_nombre: projectedRival.equipo_nombre,
                ranking: projectedRival.ranking
            } : null,
            rivales_directos: rivals,
            mensaje
        });
    } catch (error) {
        console.error('Error obteniendo camino a playoffs del equipo:', error);
        next(error);
    }
}

// GET /api/equipos/:id/comparar/:rivalId
async function obtenerComparativa(req, res, next) {
    try {
        const { id, rivalId } = req.params;
        const { torneo_id } = req.query;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const torneoIdResolved = hasPartidosTorneo && torneo_id && torneo_id !== 'todos'
            ? await resolveTorneoId(torneo_id)
            : null;

        const equiposResult = await pool.query(
            'SELECT id, nombre, ciudad, manager FROM equipos WHERE id = ANY($1::int[]) ORDER BY id ASC',
            [[Number(id), Number(rivalId)]]
        );

        if (equiposResult.rows.length < 2) {
            return res.status(404).json({ error: 'No se encontraron ambos equipos para comparar' });
        }

        const resumenResult = await pool.query(`
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
                j.equipo_id,
                COUNT(*)::INT AS juegos,
                COALESCE(SUM(j.victoria), 0)::INT AS victorias,
                COALESCE(SUM(j.derrota), 0)::INT AS derrotas,
                COALESCE(SUM(j.carreras_favor), 0)::INT AS carreras_favor,
                COALESCE(SUM(j.carreras_contra), 0)::INT AS carreras_contra,
                CASE WHEN COUNT(*) > 0
                    THEN ROUND(COALESCE(SUM(j.victoria), 0)::NUMERIC / COUNT(*), 3)
                    ELSE 0
                END AS pct
            FROM juegos j
            WHERE j.equipo_id = ANY($1::int[])
              AND ($2::int IS NULL OR j.torneo_id = $2)
            GROUP BY j.equipo_id
        `, [[Number(id), Number(rivalId)], torneoIdResolved]);

        const headToHeadResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE p.estado = 'finalizado')::INT AS juegos,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $1 AND p.carreras_local > p.carreras_visitante) OR
                    (p.equipo_visitante_id = $1 AND p.carreras_visitante > p.carreras_local)
                ))::INT AS victorias_base,
                COUNT(*) FILTER (WHERE p.estado = 'finalizado' AND (
                    (p.equipo_local_id = $2 AND p.carreras_local > p.carreras_visitante) OR
                    (p.equipo_visitante_id = $2 AND p.carreras_visitante > p.carreras_local)
                ))::INT AS victorias_rival,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_local
                    WHEN p.equipo_visitante_id = $1 THEN p.carreras_visitante
                    ELSE 0
                END), 0)::INT AS carreras_base,
                COALESCE(SUM(CASE
                    WHEN p.equipo_local_id = $2 THEN p.carreras_local
                    WHEN p.equipo_visitante_id = $2 THEN p.carreras_visitante
                    ELSE 0
                END), 0)::INT AS carreras_rival
            FROM partidos p
            WHERE (
                (p.equipo_local_id = $1 AND p.equipo_visitante_id = $2)
                OR (p.equipo_local_id = $2 AND p.equipo_visitante_id = $1)
            )
            AND ($3::int IS NULL OR p.torneo_id = $3)
        `, [Number(id), Number(rivalId), torneoIdResolved]);

        const resumenMap = new Map(resumenResult.rows.map((row) => [Number(row.equipo_id), row]));
        const equiposMap = new Map(equiposResult.rows.map((row) => [Number(row.id), row]));

        const decorate = (equipoId) => {
            const equipo = equiposMap.get(Number(equipoId));
            const resumen = resumenMap.get(Number(equipoId)) || {};
            return {
                ...equipo,
                resumen: {
                    juegos: Number(resumen.juegos || 0),
                    victorias: Number(resumen.victorias || 0),
                    derrotas: Number(resumen.derrotas || 0),
                    carreras_favor: Number(resumen.carreras_favor || 0),
                    carreras_contra: Number(resumen.carreras_contra || 0),
                    diferencial: Number(resumen.carreras_favor || 0) - Number(resumen.carreras_contra || 0),
                    pct: Number(resumen.pct || 0)
                }
            };
        };

        res.json({
            torneo_id: torneoIdResolved,
            equipo_base: decorate(id),
            equipo_rival: decorate(rivalId),
            head_to_head: headToHeadResult.rows[0] || {
                juegos: 0,
                victorias_base: 0,
                victorias_rival: 0,
                carreras_base: 0,
                carreras_rival: 0
            }
        });
    } catch (error) {
        console.error('Error obteniendo comparativa del equipo:', error);
        next(error);
    }
}

// GET /api/equipos/:id/scouting
async function obtenerScouting(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const torneoIdResolved = hasPartidosTorneo && torneo_id && torneo_id !== 'todos'
            ? await resolveTorneoId(torneo_id)
            : null;

        const equipoResult = await pool.query('SELECT * FROM equipos WHERE id = $1 LIMIT 1', [id]);
        if (!equipoResult.rows.length) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        const params = [Number(id)];
        let torneoFilter = '';
        if (torneoIdResolved) {
            params.push(torneoIdResolved);
            torneoFilter = ` AND p.torneo_id = $${params.length}`;
        }

        const gamesResult = await pool.query(`
            SELECT
                p.id AS partido_id,
                p.fecha_partido,
                p.torneo_id,
                t.nombre AS torneo_nombre,
                p.equipo_local_id,
                p.equipo_visitante_id,
                el.nombre AS equipo_local_nombre,
                ev.nombre AS equipo_visitante_nombre,
                CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_local
                    ELSE p.carreras_visitante
                END AS carreras_favor,
                CASE
                    WHEN p.equipo_local_id = $1 THEN p.carreras_visitante
                    ELSE p.carreras_local
                END AS carreras_contra,
                CASE
                    WHEN (p.equipo_local_id = $1 AND p.carreras_local > p.carreras_visitante)
                      OR (p.equipo_visitante_id = $1 AND p.carreras_visitante > p.carreras_local)
                    THEN 1 ELSE 0
                END AS victoria,
                CASE
                    WHEN (p.equipo_local_id = $1 AND p.carreras_local < p.carreras_visitante)
                      OR (p.equipo_visitante_id = $1 AND p.carreras_visitante < p.carreras_local)
                    THEN 1 ELSE 0
                END AS derrota
            FROM partidos p
            LEFT JOIN equipos el ON el.id = p.equipo_local_id
            LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
            LEFT JOIN torneos t ON t.id = p.torneo_id
            WHERE p.estado = 'finalizado'
              AND (p.equipo_local_id = $1 OR p.equipo_visitante_id = $1)
              ${torneoFilter}
            ORDER BY p.fecha_partido DESC, p.id DESC
        `, params);

        const rows = gamesResult.rows.map((row) => {
            const esLocal = Number(row.equipo_local_id) === Number(id);
            return {
                ...row,
                es_local: esLocal,
                rival_id: esLocal ? row.equipo_visitante_id : row.equipo_local_id,
                rival_nombre: esLocal ? row.equipo_visitante_nombre : row.equipo_local_nombre
            };
        });

        const recentGames = rows.slice(0, 10);
        const recent5 = buildTeamFormSummary(recentGames.slice(0, 5));
        const previous5 = buildTeamFormSummary(recentGames.slice(5, 10));
        const trend = {
            estado: recent5.pct > previous5.pct ? 'subiendo' : (recent5.pct < previous5.pct ? 'bajando' : 'estable'),
            victorias_delta: recent5.victorias - previous5.victorias,
            diferencial_delta: recent5.diferencial - previous5.diferencial
        };

        const local = buildTeamFormSummary(rows.filter((row) => row.es_local));
        const visitante = buildTeamFormSummary(rows.filter((row) => !row.es_local));

        const torneosMap = new Map();
        rows.forEach((row) => {
            const key = row.torneo_id || `sin-torneo-${row.partido_id}`;
            if (!torneosMap.has(key)) {
                torneosMap.set(key, {
                    torneo_id: row.torneo_id,
                    torneo_nombre: row.torneo_nombre || 'Sin torneo',
                    rows: []
                });
            }
            torneosMap.get(key).rows.push(row);
        });

        const torneos = [...torneosMap.values()].map((entry) => ({
            torneo_id: entry.torneo_id,
            torneo_nombre: entry.torneo_nombre,
            ...buildTeamFormSummary(entry.rows)
        })).sort((a, b) => b.juegos - a.juegos || b.victorias - a.victorias || String(a.torneo_nombre).localeCompare(String(b.torneo_nombre)));

        const rivalsMap = new Map();
        rows.forEach((row) => {
            const key = row.rival_id || row.rival_nombre || `rival-${row.partido_id}`;
            if (!rivalsMap.has(key)) {
                rivalsMap.set(key, {
                    rival_id: row.rival_id,
                    rival_nombre: row.rival_nombre || 'Rival',
                    rows: []
                });
            }
            rivalsMap.get(key).rows.push(row);
        });

        const rivales = [...rivalsMap.values()].map((entry) => ({
            rival_id: entry.rival_id,
            rival_nombre: entry.rival_nombre,
            ...buildTeamFormSummary(entry.rows)
        })).sort((a, b) => b.juegos - a.juegos || b.victorias - a.victorias || b.diferencial - a.diferencial).slice(0, 8);

        res.json({
            equipo: equipoResult.rows[0],
            recent_games: recentGames,
            recent5,
            previous5,
            trend,
            splits: { local, visitante },
            torneos,
            rivales
        });
    } catch (error) {
        console.error('Error obteniendo scouting del equipo:', error);
        next(error);
    }
}

// GET /api/equipos/:id/logo
async function obtenerLogo(req, res, next) {
    const equipoId = parseInt(req.params.id, 10);

    if (isNaN(equipoId)) {
        return res.status(400).json({ error: 'El ID del equipo debe ser un número válido' });
    }

    const logosPath = path.join(__dirname, '../../public/images/logos');

    // Paso 1: Buscar logo por convencion de ID
    const logoByIdPath = path.join(logosPath, `equipo-${equipoId}.png`);

    if (fs.existsSync(logoByIdPath)) {
        return res.sendFile(logoByIdPath);
    }

    // Paso 2: Buscar por nombre normalizado
    try {
        const result = await pool.query('SELECT nombre FROM equipos WHERE id = $1', [equipoId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Logo not found',
                equipo_id: equipoId,
                fallback: 'use_initials'
            });
        }

        const nombreEquipo = result.rows[0].nombre;
        const nombreNormalizado = nombreEquipo
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');

        const logoByNamePath = path.join(logosPath, `${nombreNormalizado}.png`);

        if (fs.existsSync(logoByNamePath)) {
            return res.sendFile(logoByNamePath);
        }

        // Paso 3: No encontrado
        return res.status(404).json({
            error: 'Logo not found',
            equipo_id: equipoId,
            fallback: 'use_initials'
        });

    } catch (error) {
        console.error(`Error buscando logo para equipo ID ${equipoId}:`, error);
        return res.status(500).json({
            error: 'Error interno del servidor',
            details: error.message
        });
    }
}

// POST /api/equipos
async function crear(req, res, next) {
    try {
        const validation = validarCrearEquipo(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { nombre, manager, ciudad } = validation.sanitized;

        const result = await pool.query(
            'INSERT INTO equipos (nombre, manager, ciudad) VALUES ($1, $2, $3) RETURNING *',
            [nombre, manager, ciudad]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un equipo con ese nombre' });
        }
        console.error('Error creando equipo:', error);
        next(error);
    }
}

// PUT /api/equipos/:id
async function actualizar(req, res, next) {
    try {
        const { id } = req.params;

        const validation = validarActualizarEquipo(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { nombre, manager, ciudad } = validation.sanitized;

        const result = await pool.query(
            'UPDATE equipos SET nombre = $1, manager = $2, ciudad = $3 WHERE id = $4 RETURNING *',
            [nombre, manager, ciudad, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        // SSE notification placeholder (se integrara en Fase 2)
        // notifyAllClients('team-updated', { category: 'general', equipoId: parseInt(id) });

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un equipo con ese nombre' });
        }
        console.error('Error actualizando equipo:', error);
        next(error);
    }
}

// DELETE /api/equipos/:id
async function eliminar(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM equipos WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        res.json({
            message: 'Equipo eliminado correctamente',
            jugadores_afectados: 'Se desvincularon automáticamente del equipo'
        });
    } catch (error) {
        console.error('Error eliminando equipo:', error);
        next(error);
    }
}

module.exports = {
    obtenerTodos,
    obtenerPorId,
    obtenerDetalles,
    obtenerEstadisticasOfensivas,
    obtenerHistorico,
    obtenerHeadToHead,
    obtenerCaminoPlayoffs,
    obtenerComparativa,
    obtenerScouting,
    obtenerLogo,
    crear,
    actualizar,
    eliminar
};

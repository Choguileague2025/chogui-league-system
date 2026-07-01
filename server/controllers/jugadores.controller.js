const pool = require('../config/database');
const { validarCrearJugador, validarActualizarJugador } = require('../validators/jugadores.validator');
const { resolveTorneoId } = require('../services/torneos.service');
const campeonesService = require('../services/campeones.service');
const { hasColumn, hasTable } = require('../utils/schema');

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildOffensiveSummary(rows = []) {
    const base = rows.reduce((acc, row) => {
        acc.juegos += 1;
        acc.plate_appearances += toNumber(row.plate_appearances);
        acc.at_bats += toNumber(row.at_bats);
        acc.hits += toNumber(row.hits);
        acc.singles += toNumber(row.singles);
        acc.doubles += toNumber(row.doubles);
        acc.triples += toNumber(row.triples);
        acc.home_runs += toNumber(row.home_runs);
        acc.rbi += toNumber(row.rbi);
        acc.runs += toNumber(row.runs);
        acc.walks += toNumber(row.walks);
        acc.strikeouts += toNumber(row.strikeouts);
        acc.stolen_bases += toNumber(row.stolen_bases);
        acc.hit_by_pitch += toNumber(row.hit_by_pitch);
        acc.sacrifice_flies += toNumber(row.sacrifice_flies);
        return acc;
    }, {
        juegos: 0,
        plate_appearances: 0,
        at_bats: 0,
        hits: 0,
        singles: 0,
        doubles: 0,
        triples: 0,
        home_runs: 0,
        rbi: 0,
        runs: 0,
        walks: 0,
        strikeouts: 0,
        stolen_bases: 0,
        hit_by_pitch: 0,
        sacrifice_flies: 0
    });

    const avg = base.at_bats > 0 ? base.hits / base.at_bats : 0;
    const obpDen = base.at_bats + base.walks + base.hit_by_pitch + base.sacrifice_flies;
    const obp = obpDen > 0 ? (base.hits + base.walks + base.hit_by_pitch) / obpDen : 0;
    const totalBases = base.singles + (base.doubles * 2) + (base.triples * 3) + (base.home_runs * 4);
    const slg = base.at_bats > 0 ? totalBases / base.at_bats : 0;

    return {
        ...base,
        avg: Number(avg.toFixed(3)),
        obp: Number(obp.toFixed(3)),
        slg: Number(slg.toFixed(3)),
        ops: Number((obp + slg).toFixed(3))
    };
}

// GET /api/jugadores
async function obtenerTodos(req, res, next) {
    try {
        const { page = 1, limit = 50, equipo_id, posicion, search } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT j.*, e.nombre as equipo_nombre
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (equipo_id) {
            query += ` AND j.equipo_id = $${paramIndex}`;
            params.push(equipo_id);
            paramIndex++;
        }
        if (posicion) {
            query += ` AND j.posicion = $${paramIndex}`;
            params.push(posicion);
            paramIndex++;
        }
        if (search) {
            query += ` AND j.nombre ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY j.nombre ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Contar total para paginacion
        let countQuery = 'SELECT COUNT(*) FROM jugadores j WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (equipo_id) {
            countQuery += ` AND j.equipo_id = $${countParamIndex}`;
            countParams.push(equipo_id);
            countParamIndex++;
        }
        if (posicion) {
            countQuery += ` AND j.posicion = $${countParamIndex}`;
            countParams.push(posicion);
            countParamIndex++;
        }
        if (search) {
            countQuery += ` AND j.nombre ILIKE $${countParamIndex}`;
            countParams.push(`%${search}%`);
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            jugadores: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error obteniendo jugadores:', error);
        next(error);
    }
}

// GET /api/jugadores/buscar
async function buscar(req, res, next) {
    try {
        const { query } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'La búsqueda debe tener al menos 2 caracteres',
                jugadores: [],
                equipos: [],
                total: 0
            });
        }

        const searchTerm = `%${query.trim()}%`;

        const jugadoresResult = await pool.query(`
            SELECT
                j.id, j.nombre, j.numero, j.posicion,
                e.id as equipo_id, e.nombre as equipo_nombre,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                CASE
                    WHEN COALESCE(eo.at_bats, 0) > 0
                    THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / eo.at_bats, 3)
                    ELSE 0.000
                END as promedio_bateo,
                'jugador' as tipo_resultado
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE LOWER(j.nombre) LIKE LOWER($1)
            ORDER BY j.nombre ASC
            LIMIT 15
        `, [searchTerm]);

        const equiposResult = await pool.query(`
            SELECT
                e.id, e.nombre, e.ciudad, e.manager,
                COUNT(j.id) as total_jugadores,
                'equipo' as tipo_resultado
            FROM equipos e
            LEFT JOIN jugadores j ON e.id = j.equipo_id
            WHERE LOWER(e.nombre) LIKE LOWER($1)
               OR LOWER(e.ciudad) LIKE LOWER($1)
            GROUP BY e.id, e.nombre, e.ciudad, e.manager
            ORDER BY e.nombre ASC
            LIMIT 10
        `, [searchTerm]);

        const totalResultados = jugadoresResult.rows.length + equiposResult.rows.length;

        res.json({
            jugadores: jugadoresResult.rows,
            equipos: equiposResult.rows,
            total: totalResultados,
            query: query.trim()
        });
    } catch (error) {
        console.error('Error buscando:', error);
        next(error);
    }
}

// GET /api/jugadores/:id
async function obtenerPorId(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT
                j.id, j.nombre, j.posicion, j.numero, j.equipo_id,
                e.nombre as equipo_nombre,
                e.manager as equipo_manager,
                e.ciudad as equipo_ciudad
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            WHERE j.id = $1
            LIMIT 1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo jugador:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/partidos
async function obtenerPartidos(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const shouldFilterByTournament = hasPartidosTorneo && torneo_id !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneo_id || null) : null;

        const jugadorQuery = await pool.query(
            'SELECT equipo_id FROM jugadores WHERE id = $1',
            [id]
        );

        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        const equipoId = jugadorQuery.rows[0].equipo_id;

        if (!equipoId) {
            return res.json([]);
        }

        const params = [equipoId];
        let torneoFilter = '';
        if (shouldFilterByTournament && torneoIdResolved) {
            params.push(torneoIdResolved);
            torneoFilter = ` AND p.torneo_id = $${params.length}`;
        }

        const partidosQuery = await pool.query(`
            SELECT
                p.id, p.fecha_partido, p.carreras_local, p.carreras_visitante,
                p.equipo_local_id, p.equipo_visitante_id,
                el.nombre as equipo_local_nombre,
                ev.nombre as equipo_visitante_nombre
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE (p.equipo_local_id = $1 OR p.equipo_visitante_id = $1)
                AND p.estado = 'finalizado'
                ${torneoFilter}
            ORDER BY p.fecha_partido DESC
            LIMIT 10
        `, params);

        res.json(partidosQuery.rows);
    } catch (error) {
        console.error('Error obteniendo partidos del jugador:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/historico
async function obtenerHistorico(req, res, next) {
    try {
        const { id } = req.params;

        const jugadorResult = await pool.query(`
            SELECT j.id, j.nombre, j.numero, j.posicion, j.equipo_id, e.nombre AS equipo_nombre
            FROM jugadores j
            LEFT JOIN equipos e ON e.id = j.equipo_id
            WHERE j.id = $1
            LIMIT 1
        `, [id]);

        if (jugadorResult.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        const ofensivaCareer = await pool.query(`
            SELECT
                COALESCE(SUM(
                    COALESCE(eo.at_bats, 0)
                    + COALESCE(eo.walks, 0)
                    + COALESCE(eo.hit_by_pitch, 0)
                    + COALESCE(eo.sacrifice_flies, 0)
                    + COALESCE(eo.sacrifice_hits, 0)
                ), 0)::INT AS plate_appearances,
                COALESCE(SUM(eo.at_bats), 0)::INT AS at_bats,
                COALESCE(SUM(eo.hits), 0)::INT AS hits,
                COALESCE(SUM(eo.doubles), 0)::INT AS doubles,
                COALESCE(SUM(eo.triples), 0)::INT AS triples,
                COALESCE(SUM(eo.home_runs), 0)::INT AS home_runs,
                COALESCE(SUM(eo.rbi), 0)::INT AS rbi,
                COALESCE(SUM(eo.runs), 0)::INT AS runs,
                COALESCE(SUM(eo.walks), 0)::INT AS walks,
                COALESCE(SUM(eo.strikeouts), 0)::INT AS strikeouts,
                COALESCE(SUM(eo.stolen_bases), 0)::INT AS stolen_bases,
                COALESCE(SUM(eo.caught_stealing), 0)::INT AS caught_stealing,
                COALESCE(SUM(eo.hit_by_pitch), 0)::INT AS hit_by_pitch,
                COALESCE(SUM(eo.sacrifice_flies), 0)::INT AS sacrifice_flies,
                COALESCE(SUM(eo.sacrifice_hits), 0)::INT AS sacrifice_hits
            FROM estadisticas_ofensivas eo
            WHERE eo.jugador_id = $1
        `, [id]);

        const pitcheoCareer = await pool.query(`
            SELECT
                COALESCE(SUM(ep.innings_pitched), 0)::NUMERIC AS innings_pitched,
                COALESCE(SUM(ep.hits_allowed), 0)::INT AS hits_allowed,
                COALESCE(SUM(ep.earned_runs), 0)::INT AS earned_runs,
                COALESCE(SUM(ep.strikeouts), 0)::INT AS strikeouts,
                COALESCE(SUM(ep.walks_allowed), 0)::INT AS walks_allowed,
                COALESCE(SUM(ep.home_runs_allowed), 0)::INT AS home_runs_allowed,
                COALESCE(SUM(ep.wins), 0)::INT AS wins,
                COALESCE(SUM(ep.losses), 0)::INT AS losses,
                COALESCE(SUM(ep.saves), 0)::INT AS saves
            FROM estadisticas_pitcheo ep
            WHERE ep.jugador_id = $1
        `, [id]);

        const defensaCareer = await pool.query(`
            SELECT
                COALESCE(SUM(ed.putouts), 0)::INT AS putouts,
                COALESCE(SUM(ed.assists), 0)::INT AS assists,
                COALESCE(SUM(ed.errors), 0)::INT AS errors,
                COALESCE(SUM(ed.double_plays), 0)::INT AS double_plays,
                COALESCE(SUM(ed.passed_balls), 0)::INT AS passed_balls,
                COALESCE(SUM(ed.chances), 0)::INT AS chances
            FROM estadisticas_defensivas ed
            WHERE ed.jugador_id = $1
        `, [id]);

        const porTorneo = await pool.query(`
            SELECT
                t.id AS torneo_id,
                t.nombre AS torneo_nombre,
                COALESCE(eo.at_bats, 0)::INT AS at_bats,
                COALESCE(eo.hits, 0)::INT AS hits,
                COALESCE(eo.home_runs, 0)::INT AS home_runs,
                COALESCE(eo.rbi, 0)::INT AS rbi,
                COALESCE(eo.runs, 0)::INT AS runs,
                COALESCE(eo.walks, 0)::INT AS walks,
                COALESCE(eo.stolen_bases, 0)::INT AS stolen_bases,
                COALESCE(ep.innings_pitched, 0)::NUMERIC AS innings_pitched,
                COALESCE(ep.earned_runs, 0)::INT AS earned_runs,
                COALESCE(ep.strikeouts, 0)::INT AS pitch_strikeouts,
                COALESCE(ep.wins, 0)::INT AS wins,
                COALESCE(ep.losses, 0)::INT AS losses,
                COALESCE(ed.chances, 0)::INT AS chances,
                COALESCE(ed.errors, 0)::INT AS errors
            FROM torneos t
            LEFT JOIN estadisticas_ofensivas eo
                ON eo.torneo_id = t.id AND eo.jugador_id = $1
            LEFT JOIN estadisticas_pitcheo ep
                ON ep.torneo_id = t.id AND ep.jugador_id = $1
            LEFT JOIN estadisticas_defensivas ed
                ON ed.torneo_id = t.id AND ed.jugador_id = $1
            WHERE eo.jugador_id IS NOT NULL
               OR ep.jugador_id IS NOT NULL
               OR ed.jugador_id IS NOT NULL
            ORDER BY t.fecha_inicio DESC NULLS LAST, t.id DESC
        `, [id]);

        const palmares = await campeonesService.obtenerPalmaresJugador(id);

        const batting = ofensivaCareer.rows[0];
        const pitching = pitcheoCareer.rows[0];
        const fielding = defensaCareer.rows[0];
        const atBats = Number(batting.at_bats) || 0;
        const hits = Number(batting.hits) || 0;
        const doubles = Number(batting.doubles) || 0;
        const triples = Number(batting.triples) || 0;
        const homeRuns = Number(batting.home_runs) || 0;
        const walks = Number(batting.walks) || 0;
        const hitByPitch = Number(batting.hit_by_pitch) || 0;
        const sacrificeFlies = Number(batting.sacrifice_flies) || 0;
        const singles = hits - doubles - triples - homeRuns;
        const avg = atBats > 0 ? hits / atBats : 0;
        const obp = (atBats + walks + hitByPitch + sacrificeFlies) > 0
            ? (hits + walks + hitByPitch) / (atBats + walks + hitByPitch + sacrificeFlies)
            : 0;
        const slg = atBats > 0 ? (singles + doubles * 2 + triples * 3 + homeRuns * 4) / atBats : 0;
        const ops = obp + slg;
        const inningsPitched = Number(pitching.innings_pitched) || 0;
        const era = inningsPitched > 0 ? ((Number(pitching.earned_runs) || 0) * 9) / inningsPitched : 0;
        const whip = inningsPitched > 0
            ? ((Number(pitching.hits_allowed) || 0) + (Number(pitching.walks_allowed) || 0)) / inningsPitched
            : 0;
        const chances = Number(fielding.chances) || 0;
        const fpct = chances > 0
            ? ((Number(fielding.putouts) || 0) + (Number(fielding.assists) || 0)) / chances
            : 0;

        res.json({
            jugador: jugadorResult.rows[0],
            career: {
                batting: {
                    ...batting,
                    avg: Number(avg.toFixed(3)),
                    obp: Number(obp.toFixed(3)),
                    slg: Number(slg.toFixed(3)),
                    ops: Number(ops.toFixed(3))
                },
                pitching: {
                    ...pitching,
                    era: Number(era.toFixed(2)),
                    whip: Number(whip.toFixed(2))
                },
                fielding: {
                    ...fielding,
                    fielding_percentage: Number(fpct.toFixed(3))
                },
                awards: palmares
            },
            by_tournament: porTorneo.rows
        });
    } catch (error) {
        console.error('Error obteniendo histórico del jugador:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/game-log
async function obtenerGameLog(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const hasOffensiveBoxscore = await hasTable('partido_jugador_ofensiva');
        const hasPitchingBoxscore = await hasTable('partido_jugador_pitcheo');
        const hasDefensiveBoxscore = await hasTable('partido_jugador_defensa');
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');

        const jugadorQuery = await pool.query('SELECT id, nombre, equipo_id FROM jugadores WHERE id = $1 LIMIT 1', [id]);
        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        if (!hasOffensiveBoxscore && !hasPitchingBoxscore && !hasDefensiveBoxscore) {
            return res.json({
                jugador: jugadorQuery.rows[0],
                games: [],
                source: 'historico_no_disponible'
            });
        }

        const shouldFilterByTournament = hasPartidosTorneo && torneo_id && torneo_id !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneo_id) : null;
        const params = [id];
        let torneoFilter = '';
        const torneoJoin = hasPartidosTorneo ? 'LEFT JOIN torneos t ON t.id = p.torneo_id' : '';
        const torneoSelect = hasPartidosTorneo ? 't.id AS torneo_id, t.nombre AS torneo_nombre,' : 'NULL::INTEGER AS torneo_id, NULL::TEXT AS torneo_nombre,';

        if (shouldFilterByTournament && torneoIdResolved) {
            params.push(torneoIdResolved);
            torneoFilter = ` AND p.torneo_id = $${params.length}`;
        }

        const query = `
            SELECT
                p.id AS partido_id,
                p.fecha_partido,
                p.estado,
                p.carreras_local,
                p.carreras_visitante,
                p.equipo_local_id,
                p.equipo_visitante_id,
                el.nombre AS equipo_local_nombre,
                ev.nombre AS equipo_visitante_nombre,
                ${torneoSelect}
                pjo.at_bats,
                pjo.hits,
                pjo.rbi,
                pjo.runs,
                pjo.home_runs,
                pjo.walks,
                pjo.strikeouts,
                pjo.stolen_bases,
                pjp.innings_pitched,
                pjp.earned_runs,
                pjp.strikeouts AS pitch_strikeouts,
                pjp.wins,
                pjp.losses,
                pjp.saves,
                pjd.putouts,
                pjd.assists,
                pjd.errors,
                pjd.chances
            FROM partidos p
            LEFT JOIN equipos el ON el.id = p.equipo_local_id
            LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
            ${torneoJoin}
            LEFT JOIN partido_jugador_ofensiva pjo ON pjo.partido_id = p.id AND pjo.jugador_id = $1
            LEFT JOIN partido_jugador_pitcheo pjp ON pjp.partido_id = p.id AND pjp.jugador_id = $1
            LEFT JOIN partido_jugador_defensa pjd ON pjd.partido_id = p.id AND pjd.jugador_id = $1
            WHERE (
                pjo.jugador_id IS NOT NULL
                OR pjp.jugador_id IS NOT NULL
                OR pjd.jugador_id IS NOT NULL
            )
            ${torneoFilter}
            ORDER BY p.fecha_partido DESC, p.id DESC
        `;

        const result = await pool.query(query, params);
        res.json({
            jugador: jugadorQuery.rows[0],
            games: result.rows,
            source: 'boxscore'
        });
    } catch (error) {
        console.error('Error obteniendo game log del jugador:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/vs-equipos
async function obtenerVsEquipos(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const hasOffensiveBoxscore = await hasTable('partido_jugador_ofensiva');
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');

        const jugadorQuery = await pool.query(
            'SELECT id, nombre FROM jugadores WHERE id = $1 LIMIT 1',
            [id]
        );

        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        if (!hasOffensiveBoxscore) {
            return res.json({
                jugador: jugadorQuery.rows[0],
                rivales: [],
                source: 'historico_no_disponible'
            });
        }

        const shouldFilterByTournament = hasPartidosTorneo && torneo_id && torneo_id !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneo_id) : null;
        const params = [id];
        let torneoFilter = '';

        if (shouldFilterByTournament && torneoIdResolved) {
            params.push(torneoIdResolved);
            torneoFilter = ` AND p.torneo_id = $${params.length}`;
        }

        const result = await pool.query(`
            SELECT
                CASE
                    WHEN pjo.equipo_id = p.equipo_local_id THEN p.equipo_visitante_id
                    ELSE p.equipo_local_id
                END AS rival_id,
                CASE
                    WHEN pjo.equipo_id = p.equipo_local_id THEN ev.nombre
                    ELSE el.nombre
                END AS rival_nombre,
                COUNT(*)::INT AS juegos,
                COALESCE(SUM(pjo.plate_appearances), 0)::INT AS plate_appearances,
                COALESCE(SUM(pjo.at_bats), 0)::INT AS at_bats,
                COALESCE(SUM(pjo.hits), 0)::INT AS hits,
                COALESCE(SUM(pjo.home_runs), 0)::INT AS home_runs,
                COALESCE(SUM(pjo.rbi), 0)::INT AS rbi,
                COALESCE(SUM(pjo.runs), 0)::INT AS runs,
                COALESCE(SUM(pjo.walks), 0)::INT AS walks,
                COALESCE(SUM(pjo.strikeouts), 0)::INT AS strikeouts,
                COALESCE(SUM(pjo.stolen_bases), 0)::INT AS stolen_bases,
                CASE
                    WHEN COALESCE(SUM(pjo.at_bats), 0) > 0
                    THEN ROUND(COALESCE(SUM(pjo.hits), 0)::numeric / SUM(pjo.at_bats), 3)
                    ELSE 0
                END AS avg
            FROM partido_jugador_ofensiva pjo
            JOIN partidos p ON p.id = pjo.partido_id
            LEFT JOIN equipos el ON el.id = p.equipo_local_id
            LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
            WHERE pjo.jugador_id = $1
              AND pjo.equipo_id IS NOT NULL
              ${torneoFilter}
            GROUP BY rival_id, rival_nombre
            ORDER BY juegos DESC, hits DESC, avg DESC, rival_nombre ASC
        `, params);

        res.json({
            jugador: jugadorQuery.rows[0],
            rivales: result.rows,
            source: 'boxscore'
        });
    } catch (error) {
        console.error('Error obteniendo histórico del jugador contra equipos:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/scouting
async function obtenerScouting(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const hasOffensiveBoxscore = await hasTable('partido_jugador_ofensiva');
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');

        const jugadorQuery = await pool.query(`
            SELECT j.id, j.nombre, j.posicion, j.equipo_id, e.nombre AS equipo_nombre
            FROM jugadores j
            LEFT JOIN equipos e ON e.id = j.equipo_id
            WHERE j.id = $1
            LIMIT 1
        `, [id]);

        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        if (!hasOffensiveBoxscore) {
            return res.json({
                jugador: jugadorQuery.rows[0],
                recent_games: [],
                recent5: buildOffensiveSummary([]),
                previous5: buildOffensiveSummary([]),
                trend: { estado: 'sin_muestra', avg_delta: 0, ops_delta: 0, hits_delta: 0 },
                splits: { local: buildOffensiveSummary([]), visitante: buildOffensiveSummary([]) },
                torneos: [],
                rivales: [],
                source: 'historico_no_disponible'
            });
        }

        const shouldFilterByTournament = hasPartidosTorneo && torneo_id && torneo_id !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneo_id) : null;
        const params = [id];
        let torneoFilter = '';

        if (shouldFilterByTournament && torneoIdResolved) {
            params.push(torneoIdResolved);
            torneoFilter = ` AND p.torneo_id = $${params.length}`;
        }

        const rowsResult = await pool.query(`
            SELECT
                p.id AS partido_id,
                p.fecha_partido,
                p.equipo_local_id,
                p.equipo_visitante_id,
                el.nombre AS equipo_local_nombre,
                ev.nombre AS equipo_visitante_nombre,
                t.id AS torneo_id,
                t.nombre AS torneo_nombre,
                pjo.equipo_id,
                pjo.plate_appearances,
                pjo.at_bats,
                pjo.hits,
                pjo.singles,
                pjo.doubles,
                pjo.triples,
                pjo.home_runs,
                pjo.rbi,
                pjo.runs,
                pjo.walks,
                pjo.strikeouts,
                pjo.stolen_bases,
                pjo.hit_by_pitch,
                pjo.sacrifice_flies
            FROM partido_jugador_ofensiva pjo
            JOIN partidos p ON p.id = pjo.partido_id
            LEFT JOIN equipos el ON el.id = p.equipo_local_id
            LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
            LEFT JOIN torneos t ON t.id = p.torneo_id
            WHERE pjo.jugador_id = $1
            ${torneoFilter}
            ORDER BY p.fecha_partido DESC, p.id DESC
        `, params);

        const rows = rowsResult.rows.map((row) => {
            const esLocal = Number(row.equipo_id) === Number(row.equipo_local_id);
            return {
                ...row,
                es_local: esLocal,
                rival_id: esLocal ? row.equipo_visitante_id : row.equipo_local_id,
                rival_nombre: esLocal ? row.equipo_visitante_nombre : row.equipo_local_nombre
            };
        });

        const recentGames = rows.slice(0, 10);
        const recent5Rows = recentGames.slice(0, 5);
        const previous5Rows = recentGames.slice(5, 10);
        const recent5 = buildOffensiveSummary(recent5Rows);
        const previous5 = buildOffensiveSummary(previous5Rows);
        const trend = {
            estado: recent5.ops > previous5.ops ? 'subiendo' : (recent5.ops < previous5.ops ? 'bajando' : 'estable'),
            avg_delta: Number((recent5.avg - previous5.avg).toFixed(3)),
            ops_delta: Number((recent5.ops - previous5.ops).toFixed(3)),
            hits_delta: recent5.hits - previous5.hits
        };

        const localRows = rows.filter((row) => row.es_local);
        const awayRows = rows.filter((row) => !row.es_local);
        const splits = {
            local: buildOffensiveSummary(localRows),
            visitante: buildOffensiveSummary(awayRows)
        };

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
            ...buildOffensiveSummary(entry.rows)
        })).sort((a, b) => b.juegos - a.juegos || String(a.torneo_nombre).localeCompare(String(b.torneo_nombre)));

        const rivalesMap = new Map();
        rows.forEach((row) => {
            const key = row.rival_id || row.rival_nombre || `rival-${row.partido_id}`;
            if (!rivalesMap.has(key)) {
                rivalesMap.set(key, {
                    rival_id: row.rival_id,
                    rival_nombre: row.rival_nombre || 'Rival',
                    rows: []
                });
            }
            rivalesMap.get(key).rows.push(row);
        });
        const rivales = [...rivalesMap.values()].map((entry) => ({
            rival_id: entry.rival_id,
            rival_nombre: entry.rival_nombre,
            ...buildOffensiveSummary(entry.rows)
        })).sort((a, b) => b.juegos - a.juegos || b.ops - a.ops || b.hits - a.hits).slice(0, 8);

        res.json({
            jugador: jugadorQuery.rows[0],
            recent_games: recentGames,
            recent5,
            previous5,
            trend,
            splits,
            torneos,
            rivales,
            source: 'boxscore'
        });
    } catch (error) {
        console.error('Error obteniendo scouting del jugador:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/comparar/:rivalId
async function obtenerComparativa(req, res, next) {
    try {
        const { id, rivalId } = req.params;
        const { torneo_id } = req.query;

        const jugadoresResult = await pool.query(`
            SELECT j.id, j.nombre, j.posicion, j.numero, j.equipo_id, e.nombre AS equipo_nombre
            FROM jugadores j
            LEFT JOIN equipos e ON e.id = j.equipo_id
            WHERE j.id = ANY($1::int[])
            ORDER BY j.id ASC
        `, [[Number(id), Number(rivalId)]]);

        if (jugadoresResult.rows.length < 2) {
            return res.status(404).json({ error: 'No se encontraron ambos jugadores para comparar' });
        }

        const torneoIdResolved = torneo_id && torneo_id !== 'todos' ? await resolveTorneoId(torneo_id) : null;

        const actualesResult = await pool.query(`
            SELECT
                eo.jugador_id,
                COALESCE(SUM(eo.at_bats), 0)::INT AS at_bats,
                COALESCE(SUM(eo.hits), 0)::INT AS hits,
                COALESCE(SUM(eo.home_runs), 0)::INT AS home_runs,
                COALESCE(SUM(eo.rbi), 0)::INT AS rbi,
                COALESCE(SUM(eo.runs), 0)::INT AS runs,
                COALESCE(SUM(eo.walks), 0)::INT AS walks,
                COALESCE(SUM(eo.stolen_bases), 0)::INT AS stolen_bases,
                CASE WHEN COALESCE(SUM(eo.at_bats), 0) > 0
                    THEN ROUND(COALESCE(SUM(eo.hits), 0)::NUMERIC / SUM(eo.at_bats), 3)
                    ELSE 0
                END AS avg,
                CASE
                    WHEN (COALESCE(SUM(eo.at_bats), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0) + COALESCE(SUM(eo.sacrifice_flies), 0)) > 0
                    THEN ROUND(
                        (COALESCE(SUM(eo.hits), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0))::NUMERIC /
                        NULLIF(COALESCE(SUM(eo.at_bats), 0) + COALESCE(SUM(eo.walks), 0) + COALESCE(SUM(eo.hit_by_pitch), 0) + COALESCE(SUM(eo.sacrifice_flies), 0), 0),
                        3
                    )
                    ELSE 0
                END AS obp,
                CASE
                    WHEN COALESCE(SUM(eo.at_bats), 0) > 0
                    THEN ROUND(
                        (
                            (COALESCE(SUM(eo.hits), 0) - COALESCE(SUM(eo.doubles), 0) - COALESCE(SUM(eo.triples), 0) - COALESCE(SUM(eo.home_runs), 0))
                            + (2 * COALESCE(SUM(eo.doubles), 0))
                            + (3 * COALESCE(SUM(eo.triples), 0))
                            + (4 * COALESCE(SUM(eo.home_runs), 0))
                        )::NUMERIC / SUM(eo.at_bats),
                        3
                    )
                    ELSE 0
                END AS slg
            FROM estadisticas_ofensivas eo
            WHERE eo.jugador_id = ANY($1::int[])
              AND ($2::int IS NULL OR eo.torneo_id = $2)
            GROUP BY eo.jugador_id
        `, [[Number(id), Number(rivalId)], torneoIdResolved]);

        const historicoResult = await pool.query(`
            SELECT
                eo.jugador_id,
                COALESCE(SUM(eo.at_bats), 0)::INT AS at_bats,
                COALESCE(SUM(eo.hits), 0)::INT AS hits,
                COALESCE(SUM(eo.home_runs), 0)::INT AS home_runs,
                COALESCE(SUM(eo.rbi), 0)::INT AS rbi,
                COALESCE(SUM(eo.runs), 0)::INT AS runs,
                COALESCE(SUM(eo.walks), 0)::INT AS walks,
                COALESCE(SUM(eo.stolen_bases), 0)::INT AS stolen_bases,
                COUNT(DISTINCT eo.torneo_id)::INT AS torneos,
                CASE WHEN COALESCE(SUM(eo.at_bats), 0) > 0
                    THEN ROUND(COALESCE(SUM(eo.hits), 0)::NUMERIC / SUM(eo.at_bats), 3)
                    ELSE 0
                END AS avg
            FROM estadisticas_ofensivas eo
            WHERE eo.jugador_id = ANY($1::int[])
            GROUP BY eo.jugador_id
        `, [[Number(id), Number(rivalId)]]);

        const actualesMap = new Map(actualesResult.rows.map((row) => [Number(row.jugador_id), row]));
        const historicoMap = new Map(historicoResult.rows.map((row) => [Number(row.jugador_id), row]));
        const jugadoresMap = new Map(jugadoresResult.rows.map((row) => [Number(row.id), row]));

        const decorate = (jugadorId) => {
            const base = jugadoresMap.get(Number(jugadorId));
            const actual = actualesMap.get(Number(jugadorId)) || {};
            const historico = historicoMap.get(Number(jugadorId)) || {};
            const ops = Number(actual.obp || 0) + Number(actual.slg || 0);
            return {
                ...base,
                actual: {
                    ...actual,
                    ops: Number(ops.toFixed(3))
                },
                historico
            };
        };

        res.json({
            torneo_id: torneoIdResolved,
            jugador_base: decorate(id),
            jugador_rival: decorate(rivalId)
        });
    } catch (error) {
        console.error('Error obteniendo comparativa del jugador:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/similares
async function obtenerSimilares(req, res, next) {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 5;

        const jugadorQuery = await pool.query(
            'SELECT posicion, equipo_id FROM jugadores WHERE id = $1',
            [id]
        );

        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        const { posicion } = jugadorQuery.rows[0];

        if (!posicion) {
            return res.json([]);
        }

        const similaresQuery = await pool.query(`
            SELECT
                j.id, j.nombre, j.numero, j.posicion,
                e.nombre as equipo_nombre,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                CASE
                    WHEN COALESCE(eo.at_bats, 0) > 0
                    THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / COALESCE(eo.at_bats, 1), 3)
                    ELSE 0.000
                END as avg
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE j.posicion = $1
                AND j.id != $2
                AND j.equipo_id IS NOT NULL
            ORDER BY avg DESC, eo.hits DESC
            LIMIT $3
        `, [posicion, id, limit]);

        res.json(similaresQuery.rows);
    } catch (error) {
        console.error('Error obteniendo jugadores similares:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/companeros
async function obtenerCompaneros(req, res, next) {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 5;

        const jugadorQuery = await pool.query(
            'SELECT equipo_id FROM jugadores WHERE id = $1',
            [id]
        );

        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        const { equipo_id } = jugadorQuery.rows[0];

        if (!equipo_id) {
            return res.json([]);
        }

        const companerosQuery = await pool.query(`
            SELECT
                j.id, j.nombre, j.numero, j.posicion,
                e.nombre as equipo_nombre,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                CASE
                    WHEN COALESCE(eo.at_bats, 0) > 0
                    THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / COALESCE(eo.at_bats, 1), 3)
                    ELSE 0.000
                END as avg
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE j.equipo_id = $1
                AND j.id != $2
            ORDER BY avg DESC, eo.hits DESC
            LIMIT $3
        `, [equipo_id, id, limit]);

        res.json(companerosQuery.rows);
    } catch (error) {
        console.error('Error obteniendo compañeros de equipo:', error);
        next(error);
    }
}

// POST /api/jugadores
async function crear(req, res, next) {
    try {
        const validation = validarCrearJugador(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { nombre, equipo_id, posicion, numero } = validation.sanitized;

        // Verificar que el equipo existe (si se proporcionó)
        if (equipo_id !== null) {
            const eq = await pool.query('SELECT id FROM equipos WHERE id = $1', [equipo_id]);
            if (eq.rows.length === 0) {
                return res.status(400).json({ error: 'El equipo seleccionado no existe' });
            }
        }

        // Verificar número duplicado en equipo
        if (numero !== null && equipo_id !== null) {
            const numeroExists = await pool.query(
                'SELECT 1 FROM jugadores WHERE equipo_id=$1 AND numero=$2',
                [equipo_id, numero]
            );
            if (numeroExists.rows.length > 0) {
                return res.status(409).json({ error: 'Ya existe un jugador con ese número en el equipo' });
            }
        }

        const result = await pool.query(
            'INSERT INTO jugadores (nombre, equipo_id, posicion, numero) VALUES ($1,$2,$3,$4) RETURNING *',
            [nombre, equipo_id, posicion, numero]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando jugador:', error);
        next(error);
    }
}

// PUT /api/jugadores/:id
async function actualizar(req, res, next) {
    try {
        const { id } = req.params;

        const validation = validarActualizarJugador(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { nombre, equipo_id, posicion, numero } = validation.sanitized;

        // Verificar que el equipo existe
        const equipoExists = await pool.query('SELECT id FROM equipos WHERE id = $1', [equipo_id]);
        if (equipoExists.rows.length === 0) {
            return res.status(400).json({ error: 'El equipo especificado no existe' });
        }

        // Verificar número duplicado
        if (numero) {
            const numeroExists = await pool.query(
                'SELECT id FROM jugadores WHERE equipo_id = $1 AND numero = $2 AND id != $3',
                [equipo_id, numero, id]
            );
            if (numeroExists.rows.length > 0) {
                return res.status(409).json({
                    error: 'Ya existe otro jugador con ese número en el equipo'
                });
            }
        }

        const result = await pool.query(
            'UPDATE jugadores SET nombre = $1, equipo_id = $2, posicion = $3, numero = $4 WHERE id = $5 RETURNING *',
            [nombre, equipo_id, posicion, numero, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        // SSE placeholder
        // notifyAllClients('player-updated', { category: 'general', jugadorId: parseInt(id), equipoId: equipo_id || null });

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando jugador:', error);
        next(error);
    }
}

// DELETE /api/jugadores/:id
async function eliminar(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM jugadores WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        res.json({
            message: 'Jugador eliminado correctamente',
            estadisticas_eliminadas: 'Se eliminaron automáticamente en cascada'
        });
    } catch (error) {
        console.error('Error eliminando jugador:', error);
        next(error);
    }
}

module.exports = {
    obtenerTodos,
    buscar,
    obtenerPorId,
    obtenerPartidos,
    obtenerHistorico,
    obtenerGameLog,
    obtenerVsEquipos,
    obtenerScouting,
    obtenerComparativa,
    obtenerSimilares,
    obtenerCompaneros,
    crear,
    actualizar,
    eliminar
};

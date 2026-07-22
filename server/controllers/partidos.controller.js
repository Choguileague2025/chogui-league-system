const pool = require('../config/database');
const { validarCrearPartido, validarActualizarPartido } = require('../validators/partidos.validator');
const { resolveTorneoId } = require('../services/torneos.service');
const { hasColumn, hasTable } = require('../utils/schema');

// GET /api/partidos
async function obtenerTodos(req, res, next) {
    try {
        const { estado, limit, page = 1, equipo_id, fecha_desde, fecha_hasta, torneo_id } = req.query;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const shouldFilterByTournament = hasPartidosTorneo && torneo_id !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneo_id || null) : null;

        // CASO 1: Peticion simple del landing page
        if (estado && limit) {
            const simpleLimit = Number(limit) || 5;
            const simpleParams = [estado];
            let simpleWhere = 'WHERE p.estado = $1';
            if (shouldFilterByTournament && torneoIdResolved) {
                simpleParams.push(torneoIdResolved);
                simpleWhere += ` AND p.torneo_id = $${simpleParams.length}`;
            }
            const simpleQuery = `
                SELECT
                    p.id,
                    el.nombre as equipo_local_nombre,
                    ev.nombre as equipo_visitante_nombre,
                    p.carreras_local,
                    p.carreras_visitante,
                    p.innings_jugados as innings,
                    p.fecha_partido
                FROM partidos p
                JOIN equipos el ON p.equipo_local_id = el.id
                JOIN equipos ev ON p.equipo_visitante_id = ev.id
                ${simpleWhere}
                ORDER BY p.fecha_partido DESC, p.hora DESC
                LIMIT $${simpleParams.length + 1};
            `;
            simpleParams.push(simpleLimit);
            const { rows } = await pool.query(simpleQuery, simpleParams);
            return res.json(rows);
        }

        // CASO 2: Paginacion para admin
        const adminLimit = 20;
        const offset = (page - 1) * adminLimit;

        let query = `
            SELECT p.*,
                   el.nombre as equipo_local_nombre,
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (equipo_id) {
            query += ` AND (p.equipo_local_id = $${paramIndex} OR p.equipo_visitante_id = $${paramIndex})`;
            params.push(equipo_id);
            paramIndex++;
        }
        if (shouldFilterByTournament && torneoIdResolved) {
            query += ` AND p.torneo_id = $${paramIndex}`;
            params.push(torneoIdResolved);
            paramIndex++;
        }
        if (fecha_desde) {
            query += ` AND p.fecha_partido >= $${paramIndex}`;
            params.push(fecha_desde);
            paramIndex++;
        }
        if (fecha_hasta) {
            query += ` AND p.fecha_partido <= $${paramIndex}`;
            params.push(fecha_hasta);
            paramIndex++;
        }

        query += ` ORDER BY p.fecha_partido DESC, p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(adminLimit, offset);

        const result = await pool.query(query, params);

        let countQuery = 'SELECT COUNT(*) FROM partidos p WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (equipo_id) {
            countQuery += ` AND (p.equipo_local_id = $${countParamIndex} OR p.equipo_visitante_id = $${countParamIndex})`;
            countParams.push(equipo_id);
            countParamIndex++;
        }
        if (shouldFilterByTournament && torneoIdResolved) {
            countQuery += ` AND p.torneo_id = $${countParamIndex}`;
            countParams.push(torneoIdResolved);
            countParamIndex++;
        }
        if (fecha_desde) {
            countQuery += ` AND p.fecha_partido >= $${countParamIndex}`;
            countParams.push(fecha_desde);
            countParamIndex++;
        }
        if (fecha_hasta) {
            countQuery += ` AND p.fecha_partido <= $${countParamIndex}`;
            countParams.push(fecha_hasta);
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            partidos: result.rows,
            pagination: {
                page: parseInt(page),
                limit: adminLimit,
                total,
                pages: Math.ceil(total / adminLimit)
            }
        });
    } catch (error) {
        console.error('Error obteniendo partidos:', error);
        next(error);
    }
}

// GET /api/partidos/proximos
async function obtenerProximos(req, res, next) {
    try {
        const { torneo_id } = req.query;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const shouldFilterByTournament = hasPartidosTorneo && torneo_id !== 'todos';
        const torneoIdResolved = shouldFilterByTournament ? await resolveTorneoId(torneo_id || null) : null;
        const params = [];
        const where = [`p.estado = 'programado'`, 'p.fecha_partido >= CURRENT_DATE'];

        if (shouldFilterByTournament && torneoIdResolved) {
            params.push(torneoIdResolved);
            where.push(`p.torneo_id = $${params.length}`);
        }

        const query = `
            SELECT
                p.id, p.fecha_partido, p.hora, p.estado,
                p.equipo_local_id, p.equipo_visitante_id,
                p.carreras_local, p.carreras_visitante, p.innings_jugados,
                el.nombre as equipo_local_nombre,
                ev.nombre as equipo_visitante_nombre,
                el.ciudad as ciudad_local,
                ev.ciudad as ciudad_visitante
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE ${where.join(' AND ')}
            ORDER BY p.fecha_partido ASC, p.hora ASC
            LIMIT 10
        `;

        const { rows: partidos } = await pool.query(query, params);

        if (partidos.length === 0) {
            return res.json([]);
        }

        const partidosConRecords = await Promise.all(partidos.map(async (partido) => {
            try {
                const recordTournamentClause = shouldFilterByTournament && torneoIdResolved
                    ? `AND torneo_id = $2`
                    : '';
                const recordParamsLocal = shouldFilterByTournament && torneoIdResolved
                    ? [partido.equipo_local_id, torneoIdResolved]
                    : [partido.equipo_local_id];
                const recordParamsVisitor = shouldFilterByTournament && torneoIdResolved
                    ? [partido.equipo_visitante_id, torneoIdResolved]
                    : [partido.equipo_visitante_id];

                const recordLocal = await pool.query(`
                    SELECT
                        COUNT(*) FILTER (WHERE
                            (equipo_local_id = $1 AND carreras_local > carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante > carreras_local)
                        ) as victorias,
                        COUNT(*) FILTER (WHERE
                            (equipo_local_id = $1 AND carreras_local < carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante < carreras_local)
                        ) as derrotas
                    FROM partidos
                    WHERE (equipo_local_id = $1 OR equipo_visitante_id = $1)
                       AND estado = 'finalizado'
                       AND carreras_local IS NOT NULL
                       AND carreras_visitante IS NOT NULL
                       ${recordTournamentClause}
                `, recordParamsLocal);

                const recordVisitante = await pool.query(`
                    SELECT
                        COUNT(*) FILTER (WHERE
                            (equipo_local_id = $1 AND carreras_local > carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante > carreras_local)
                        ) as victorias,
                        COUNT(*) FILTER (WHERE
                            (equipo_local_id = $1 AND carreras_local < carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante < carreras_local)
                        ) as derrotas
                    FROM partidos
                    WHERE (equipo_local_id = $1 OR equipo_visitante_id = $1)
                       AND estado = 'finalizado'
                       AND carreras_local IS NOT NULL
                       AND carreras_visitante IS NOT NULL
                       ${recordTournamentClause}
                `, recordParamsVisitor);

                return {
                    ...partido,
                    record_local: `${recordLocal.rows[0]?.victorias || 0}-${recordLocal.rows[0]?.derrotas || 0}`,
                    record_visitante: `${recordVisitante.rows[0]?.victorias || 0}-${recordVisitante.rows[0]?.derrotas || 0}`
                };
            } catch (recordError) {
                console.error('Error calculando records:', recordError);
                return { ...partido, record_local: '0-0', record_visitante: '0-0' };
            }
        }));

        res.json(partidosConRecords);
    } catch (error) {
        console.error('Error obteniendo próximos partidos:', error);
        next(error);
    }
}

// GET /api/partidos/:id
async function obtenerPorId(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT p.*,
                   el.nombre as equipo_local_nombre,
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo partido:', error);
        next(error);
    }
}

function safeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function roundTo(value, decimals = 3) {
    return Number(safeNumber(value).toFixed(decimals));
}

function buildOffensiveLine(row) {
    const atBats = safeNumber(row.at_bats);
    const hits = safeNumber(row.hits);
    const doubles = safeNumber(row.doubles);
    const triples = safeNumber(row.triples);
    const homeRuns = safeNumber(row.home_runs);
    const walks = safeNumber(row.walks);
    const hitByPitch = safeNumber(row.hit_by_pitch);
    const sacrificeFlies = safeNumber(row.sacrifice_flies);
    const singles = Math.max(0, hits - doubles - triples - homeRuns);
    const totalBases = singles + doubles * 2 + triples * 3 + homeRuns * 4;
    const avg = atBats > 0 ? hits / atBats : 0;
    const obpDen = atBats + walks + hitByPitch + sacrificeFlies;
    const obp = obpDen > 0 ? (hits + walks + hitByPitch) / obpDen : 0;
    const slg = atBats > 0 ? totalBases / atBats : 0;

    return {
        ...row,
        singles,
        total_bases: totalBases,
        avg: roundTo(avg, 3),
        obp: roundTo(obp, 3),
        slg: roundTo(slg, 3),
        ops: roundTo(obp + slg, 3)
    };
}

function buildPitchingLine(row) {
    const inningsPitched = safeNumber(row.innings_pitched);
    const earnedRuns = safeNumber(row.earned_runs);
    const hitsAllowed = safeNumber(row.hits_allowed);
    const walksAllowed = safeNumber(row.walks_allowed);

    return {
        ...row,
        era: roundTo(inningsPitched > 0 ? (earnedRuns * 9) / inningsPitched : 0, 2),
        whip: roundTo(inningsPitched > 0 ? (hitsAllowed + walksAllowed) / inningsPitched : 0, 2)
    };
}

function buildDefensiveLine(row) {
    const chances = safeNumber(row.chances);
    const putouts = safeNumber(row.putouts);
    const assists = safeNumber(row.assists);

    return {
        ...row,
        fielding_percentage: roundTo(chances > 0 ? (putouts + assists) / chances : 0, 3)
    };
}

function summarizeTeamBoxscore({ teamId, teamName, offensiveRows, pitchingRows, defensiveRows, partido }) {
    const offensive = offensiveRows.filter(row => Number(row.equipo_id) === Number(teamId)).map(buildOffensiveLine);
    const pitching = pitchingRows.filter(row => Number(row.equipo_id) === Number(teamId)).map(buildPitchingLine);
    const defensive = defensiveRows.filter(row => Number(row.equipo_id) === Number(teamId)).map(buildDefensiveLine);

    const offenseTotals = offensive.reduce((acc, row) => {
        acc.plate_appearances += safeNumber(row.plate_appearances);
        acc.at_bats += safeNumber(row.at_bats);
        acc.hits += safeNumber(row.hits);
        acc.singles += safeNumber(row.singles);
        acc.doubles += safeNumber(row.doubles);
        acc.triples += safeNumber(row.triples);
        acc.home_runs += safeNumber(row.home_runs);
        acc.rbi += safeNumber(row.rbi);
        acc.runs += safeNumber(row.runs);
        acc.walks += safeNumber(row.walks);
        acc.strikeouts += safeNumber(row.strikeouts);
        acc.stolen_bases += safeNumber(row.stolen_bases);
        acc.caught_stealing += safeNumber(row.caught_stealing);
        acc.hit_by_pitch += safeNumber(row.hit_by_pitch);
        acc.sacrifice_flies += safeNumber(row.sacrifice_flies);
        acc.sacrifice_hits += safeNumber(row.sacrifice_hits);
        acc.total_bases += safeNumber(row.total_bases);
        return acc;
    }, {
        plate_appearances: 0, at_bats: 0, hits: 0, singles: 0, doubles: 0, triples: 0, home_runs: 0,
        rbi: 0, runs: 0, walks: 0, strikeouts: 0, stolen_bases: 0, caught_stealing: 0, hit_by_pitch: 0,
        sacrifice_flies: 0, sacrifice_hits: 0, total_bases: 0
    });

    const obpDen = offenseTotals.at_bats + offenseTotals.walks + offenseTotals.hit_by_pitch + offenseTotals.sacrifice_flies;
    offenseTotals.avg = roundTo(offenseTotals.at_bats > 0 ? offenseTotals.hits / offenseTotals.at_bats : 0, 3);
    offenseTotals.obp = roundTo(obpDen > 0 ? (offenseTotals.hits + offenseTotals.walks + offenseTotals.hit_by_pitch) / obpDen : 0, 3);
    offenseTotals.slg = roundTo(offenseTotals.at_bats > 0 ? offenseTotals.total_bases / offenseTotals.at_bats : 0, 3);
    offenseTotals.ops = roundTo(offenseTotals.obp + offenseTotals.slg, 3);

    const pitchingTotals = pitching.reduce((acc, row) => {
        acc.innings_pitched += safeNumber(row.innings_pitched);
        acc.hits_allowed += safeNumber(row.hits_allowed);
        acc.earned_runs += safeNumber(row.earned_runs);
        acc.strikeouts += safeNumber(row.strikeouts);
        acc.walks_allowed += safeNumber(row.walks_allowed);
        acc.home_runs_allowed += safeNumber(row.home_runs_allowed);
        acc.wins += safeNumber(row.wins);
        acc.losses += safeNumber(row.losses);
        acc.saves += safeNumber(row.saves);
        return acc;
    }, {
        innings_pitched: 0, hits_allowed: 0, earned_runs: 0, strikeouts: 0,
        walks_allowed: 0, home_runs_allowed: 0, wins: 0, losses: 0, saves: 0
    });
    pitchingTotals.era = roundTo(pitchingTotals.innings_pitched > 0 ? (pitchingTotals.earned_runs * 9) / pitchingTotals.innings_pitched : 0, 2);
    pitchingTotals.whip = roundTo(pitchingTotals.innings_pitched > 0 ? (pitchingTotals.hits_allowed + pitchingTotals.walks_allowed) / pitchingTotals.innings_pitched : 0, 2);

    const defensiveTotals = defensive.reduce((acc, row) => {
        acc.putouts += safeNumber(row.putouts);
        acc.assists += safeNumber(row.assists);
        acc.errors += safeNumber(row.errors);
        acc.double_plays += safeNumber(row.double_plays);
        acc.passed_balls += safeNumber(row.passed_balls);
        acc.chances += safeNumber(row.chances);
        return acc;
    }, {
        putouts: 0, assists: 0, errors: 0, double_plays: 0, passed_balls: 0, chances: 0
    });
    defensiveTotals.fielding_percentage = roundTo(defensiveTotals.chances > 0 ? (defensiveTotals.putouts + defensiveTotals.assists) / defensiveTotals.chances : 0, 3);

    const isLocal = Number(partido.equipo_local_id) === Number(teamId);
    const carreras = safeNumber(isLocal ? partido.carreras_local : partido.carreras_visitante);

    return {
        team_id: Number(teamId),
        team_name: teamName,
        side: isLocal ? 'local' : 'visitante',
        score: carreras,
        offense: offensive,
        pitching,
        defense: defensive,
        totals: {
            offense: offenseTotals,
            pitching: pitchingTotals,
            defense: defensiveTotals
        }
    };
}

function buildHighlights({ offensiveRows, pitchingRows, defensiveRows }) {
    const offensive = offensiveRows.map(buildOffensiveLine).map(row => ({
        jugador_id: row.jugador_id,
        jugador_nombre: row.jugador_nombre,
        equipo_id: row.equipo_id,
        equipo_nombre: row.equipo_nombre,
        score: roundTo(
            safeNumber(row.hits) * 2
            + safeNumber(row.doubles)
            + safeNumber(row.triples) * 1.5
            + safeNumber(row.home_runs) * 4
            + safeNumber(row.rbi) * 1.5
            + safeNumber(row.runs)
            + safeNumber(row.walks) * 0.7
            + safeNumber(row.stolen_bases) * 0.8,
            2
        ),
        summary: `${safeNumber(row.hits)} H • ${safeNumber(row.home_runs)} HR • ${safeNumber(row.rbi)} RBI • OPS ${Number(row.ops || 0).toFixed(3)}`,
        type: 'ofensiva'
    })).sort((a, b) => b.score - a.score).slice(0, 3);

    const pitching = pitchingRows.map(buildPitchingLine).map(row => ({
        jugador_id: row.jugador_id,
        jugador_nombre: row.jugador_nombre,
        equipo_id: row.equipo_id,
        equipo_nombre: row.equipo_nombre,
        score: roundTo(
            safeNumber(row.innings_pitched) * 3
            + safeNumber(row.strikeouts) * 1.2
            + safeNumber(row.wins) * 2
            + safeNumber(row.saves) * 2
            - safeNumber(row.earned_runs) * 2
            - safeNumber(row.walks_allowed) * 0.5
            - safeNumber(row.hits_allowed) * 0.35,
            2
        ),
        summary: `${safeNumber(row.innings_pitched).toFixed(1)} IP • ${safeNumber(row.strikeouts)} K • ERA ${Number(row.era || 0).toFixed(2)}`,
        type: 'pitcheo'
    })).sort((a, b) => b.score - a.score).slice(0, 3);

    const defense = defensiveRows.map(buildDefensiveLine).map(row => ({
        jugador_id: row.jugador_id,
        jugador_nombre: row.jugador_nombre,
        equipo_id: row.equipo_id,
        equipo_nombre: row.equipo_nombre,
        score: roundTo(
            safeNumber(row.putouts) * 0.5
            + safeNumber(row.assists) * 0.75
            + safeNumber(row.double_plays) * 1.5
            - safeNumber(row.errors) * 2
            + Number(row.fielding_percentage || 0) * 2,
            2
        ),
        summary: `${safeNumber(row.putouts)} PO • ${safeNumber(row.assists)} A • ${safeNumber(row.errors)} E • FPCT ${Number(row.fielding_percentage || 0).toFixed(3)}`,
        type: 'defensa'
    })).sort((a, b) => b.score - a.score).slice(0, 3);

    const mvpMap = new Map();
    [...offensive, ...pitching, ...defense].forEach(entry => {
        const key = String(entry.jugador_id);
        const current = mvpMap.get(key) || {
            jugador_id: entry.jugador_id,
            jugador_nombre: entry.jugador_nombre,
            equipo_id: entry.equipo_id,
            equipo_nombre: entry.equipo_nombre,
            score: 0,
            breakdown: []
        };
        current.score += safeNumber(entry.score);
        current.breakdown.push(entry.summary);
        mvpMap.set(key, current);
    });

    const mvpCandidates = [...mvpMap.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(entry => ({
            ...entry,
            score: roundTo(entry.score, 2),
            summary: entry.breakdown.slice(0, 2).join(' • ')
        }));

    return {
        ofensiva: offensive,
        pitcheo: pitching,
        defensa: defense,
        mvp_candidates: mvpCandidates
    };
}

// GET /api/partidos/:id/boxscore
async function obtenerBoxscore(req, res, next) {
    try {
        const { id } = req.params;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const hasJugadorDelPartido = await hasColumn('partidos', 'jugador_del_partido_id');
        const hasPitcherGanador = await hasColumn('partidos', 'pitcher_ganador_id');
        const hasPitcherPerdedor = await hasColumn('partidos', 'pitcher_perdedor_id');
        const torneoJoin = hasPartidosTorneo ? 'LEFT JOIN torneos t ON t.id = p.torneo_id' : '';
        const torneoSelect = hasPartidosTorneo ? 't.nombre AS torneo_nombre' : 'NULL::TEXT AS torneo_nombre';
        const metadataSelect = [
            hasJugadorDelPartido ? null : 'NULL::INTEGER AS jugador_del_partido_id',
            hasPitcherGanador ? null : 'NULL::INTEGER AS pitcher_ganador_id',
            hasPitcherPerdedor ? null : 'NULL::INTEGER AS pitcher_perdedor_id'
        ].filter(Boolean).join(',\n                       ');
        const [partidoResult, hasOffensiveBoxscore, hasPitchingBoxscore, hasDefensiveBoxscore] = await Promise.all([
            pool.query(`
                SELECT p.*,
                       el.nombre AS equipo_local_nombre,
                       ev.nombre AS equipo_visitante_nombre,
                       ${torneoSelect}${metadataSelect ? `,
                       ${metadataSelect}` : ''}
                FROM partidos p
                LEFT JOIN equipos el ON el.id = p.equipo_local_id
                LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
                ${torneoJoin}
                WHERE p.id = $1
                LIMIT 1
            `, [id]),
            hasTable('partido_jugador_ofensiva'),
            hasTable('partido_jugador_pitcheo'),
            hasTable('partido_jugador_defensa')
        ]);

        if (partidoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        const partido = partidoResult.rows[0];
        const ofensivaResult = hasOffensiveBoxscore ? await pool.query(`
            SELECT pjo.*, j.nombre AS jugador_nombre, j.numero, j.posicion, e.nombre AS equipo_nombre
            FROM partido_jugador_ofensiva pjo
            JOIN jugadores j ON j.id = pjo.jugador_id
            LEFT JOIN equipos e ON e.id = pjo.equipo_id
            WHERE pjo.partido_id = $1
            ORDER BY pjo.equipo_id ASC, pjo.batting_order ASC NULLS LAST, j.nombre ASC
        `, [id]) : { rows: [] };

        const pitcheoResult = hasPitchingBoxscore ? await pool.query(`
            SELECT pjp.*, j.nombre AS jugador_nombre, j.numero, e.nombre AS equipo_nombre
            FROM partido_jugador_pitcheo pjp
            JOIN jugadores j ON j.id = pjp.jugador_id
            LEFT JOIN equipos e ON e.id = pjp.equipo_id
            WHERE pjp.partido_id = $1
            ORDER BY pjp.equipo_id ASC, pjp.innings_pitched DESC, j.nombre ASC
        `, [id]) : { rows: [] };

        const defensaResult = hasDefensiveBoxscore ? await pool.query(`
            SELECT pjd.*, j.nombre AS jugador_nombre, j.numero, e.nombre AS equipo_nombre
            FROM partido_jugador_defensa pjd
            JOIN jugadores j ON j.id = pjd.jugador_id
            LEFT JOIN equipos e ON e.id = pjd.equipo_id
            WHERE pjd.partido_id = $1
            ORDER BY pjd.equipo_id ASC, j.nombre ASC
        `, [id]) : { rows: [] };

        const ofensiva = ofensivaResult.rows.map(buildOffensiveLine);
        const pitcheo = pitcheoResult.rows.map(buildPitchingLine);
        const defensa = defensaResult.rows.map(buildDefensiveLine);
        const equipos = {
            local: summarizeTeamBoxscore({
                teamId: partido.equipo_local_id,
                teamName: partido.equipo_local_nombre,
                offensiveRows: ofensiva,
                pitchingRows: pitcheo,
                defensiveRows: defensa,
                partido
            }),
            visitante: summarizeTeamBoxscore({
                teamId: partido.equipo_visitante_id,
                teamName: partido.equipo_visitante_nombre,
                offensiveRows: ofensiva,
                pitchingRows: pitcheo,
                defensiveRows: defensa,
                partido
            })
        };
        const destacados = buildHighlights({
            offensiveRows: ofensiva,
            pitchingRows: pitcheo,
            defensiveRows: defensa
        });
        const metadata = {
            jugador_del_partido: null,
            pitcher_ganador: null,
            pitcher_perdedor: null
        };
        const playerIndex = new Map();
        [...ofensiva, ...pitcheo, ...defensa].forEach((row) => {
            if (!row?.jugador_id || playerIndex.has(Number(row.jugador_id))) return;
            playerIndex.set(Number(row.jugador_id), {
                jugador_id: Number(row.jugador_id),
                jugador_nombre: row.jugador_nombre,
                equipo_id: row.equipo_id ? Number(row.equipo_id) : null,
                equipo_nombre: row.equipo_nombre || null
            });
        });
        const fallbackMeta = (playerId, defaultName, summary) => {
            if (!playerId) return null;
            return playerIndex.get(Number(playerId)) || {
                jugador_id: Number(playerId),
                jugador_nombre: defaultName,
                equipo_id: null,
                equipo_nombre: null,
                summary: summary || null
            };
        };
        metadata.jugador_del_partido = fallbackMeta(
            partido.jugador_del_partido_id,
            'Jugador del partido',
            destacados.mvp_candidates[0]?.summary || null
        );
        metadata.pitcher_ganador = fallbackMeta(
            partido.pitcher_ganador_id,
            'Pitcher ganador',
            'Decisión oficial'
        );
        metadata.pitcher_perdedor = fallbackMeta(
            partido.pitcher_perdedor_id,
            'Pitcher perdedor',
            'Decisión oficial'
        );
        if (metadata.jugador_del_partido && !metadata.jugador_del_partido.summary) {
            metadata.jugador_del_partido.summary = destacados.mvp_candidates[0]?.summary || null;
        }
        if (metadata.pitcher_ganador && !metadata.pitcher_ganador.summary) {
            metadata.pitcher_ganador.summary = 'Decisión oficial';
        }
        if (metadata.pitcher_perdedor && !metadata.pitcher_perdedor.summary) {
            metadata.pitcher_perdedor.summary = 'Decisión oficial';
        }

        const resumen = {
            boxscore_cargado: Boolean(ofensiva.length || pitcheo.length || defensa.length),
            total_hits_local: equipos.local.totals.offense.hits,
            total_hits_visitante: equipos.visitante.totals.offense.hits,
            total_errors_local: equipos.local.totals.defense.errors,
            total_errors_visitante: equipos.visitante.totals.defense.errors,
            total_hr_local: equipos.local.totals.offense.home_runs,
            total_hr_visitante: equipos.visitante.totals.offense.home_runs,
            mvp_proyectado: destacados.mvp_candidates[0] || null,
            jugador_del_partido: metadata.jugador_del_partido,
            pitcher_ganador: metadata.pitcher_ganador,
            pitcher_perdedor: metadata.pitcher_perdedor
        };

        res.json({
            partido,
            resumen,
            metadata,
            equipos,
            destacados,
            ofensiva,
            pitcheo,
            defensa
        });
    } catch (error) {
        console.error('Error obteniendo boxscore:', error);
        next(error);
    }
}

async function guardarBoxscore(req, res, next) {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const {
            jugador_del_partido_id = null,
            pitcher_ganador_id = null,
            pitcher_perdedor_id = null,
            ofensiva = [],
            pitcheo = [],
            defensa = []
        } = req.body || {};
        const hasOffensiveBoxscore = await hasTable('partido_jugador_ofensiva');
        const hasPitchingBoxscore = await hasTable('partido_jugador_pitcheo');
        const hasDefensiveBoxscore = await hasTable('partido_jugador_defensa');
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const hasJugadorDelPartido = await hasColumn('partidos', 'jugador_del_partido_id');
        const hasPitcherGanador = await hasColumn('partidos', 'pitcher_ganador_id');
        const hasPitcherPerdedor = await hasColumn('partidos', 'pitcher_perdedor_id');
        const hasOffensiveTorneo = await hasColumn('partido_jugador_ofensiva', 'torneo_id');
        const hasPitchingTorneo = await hasColumn('partido_jugador_pitcheo', 'torneo_id');
        const hasDefensiveTorneo = await hasColumn('partido_jugador_defensa', 'torneo_id');

        if (!hasOffensiveBoxscore || !hasPitchingBoxscore || !hasDefensiveBoxscore) {
            return res.status(400).json({ error: 'Las tablas de boxscore aún no existen. Ejecute la migración 006_boxscore_historico.sql.' });
        }

        const selectFields = ['id'];
        if (hasPartidosTorneo) {
            selectFields.push('torneo_id');
        }
        const partidoResult = await client.query(`SELECT ${selectFields.join(', ')} FROM partidos WHERE id = $1 LIMIT 1`, [id]);
        if (partidoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        const torneoId = partidoResult.rows[0].torneo_id || null;
        await client.query('BEGIN');
        const updateAssignments = [];
        const updateValues = [];
        if (hasJugadorDelPartido) {
            updateAssignments.push(`jugador_del_partido_id = $${updateValues.length + 1}`);
            updateValues.push(jugador_del_partido_id || null);
        }
        if (hasPitcherGanador) {
            updateAssignments.push(`pitcher_ganador_id = $${updateValues.length + 1}`);
            updateValues.push(pitcher_ganador_id || null);
        }
        if (hasPitcherPerdedor) {
            updateAssignments.push(`pitcher_perdedor_id = $${updateValues.length + 1}`);
            updateValues.push(pitcher_perdedor_id || null);
        }
        if (updateAssignments.length) {
            updateValues.push(id);
            await client.query(
                `UPDATE partidos SET ${updateAssignments.join(', ')} WHERE id = $${updateValues.length}`,
                updateValues
            );
        }

        await client.query('DELETE FROM partido_jugador_ofensiva WHERE partido_id = $1', [id]);
        await client.query('DELETE FROM partido_jugador_pitcheo WHERE partido_id = $1', [id]);
        await client.query('DELETE FROM partido_jugador_defensa WHERE partido_id = $1', [id]);

        for (const row of ofensiva) {
            const columns = [
                'partido_id', 'jugador_id', 'equipo_id', 'batting_order',
                'plate_appearances', 'at_bats', 'hits', 'singles', 'doubles', 'triples', 'home_runs',
                'rbi', 'runs', 'walks', 'strikeouts', 'stolen_bases', 'caught_stealing',
                'hit_by_pitch', 'sacrifice_flies', 'sacrifice_hits'
            ];
            const values = [
                id, row.jugador_id, row.equipo_id || null, row.batting_order || null,
                row.plate_appearances || 0, row.at_bats || 0, row.hits || 0, row.singles || 0,
                row.doubles || 0, row.triples || 0, row.home_runs || 0, row.rbi || 0,
                row.runs || 0, row.walks || 0, row.strikeouts || 0, row.stolen_bases || 0,
                row.caught_stealing || 0, row.hit_by_pitch || 0, row.sacrifice_flies || 0,
                row.sacrifice_hits || 0
            ];
            if (hasOffensiveTorneo) {
                columns.splice(1, 0, 'torneo_id');
                values.splice(1, 0, torneoId);
            }
            const placeholders = values.map((_, index) => `$${index + 1}`);
            await client.query(
                `INSERT INTO partido_jugador_ofensiva (${columns.join(', ')}, updated_at)
                 VALUES (${placeholders.join(', ')}, CURRENT_TIMESTAMP)`,
                values
            );
        }

        for (const row of pitcheo) {
            const columns = [
                'partido_id', 'jugador_id', 'equipo_id', 'innings_pitched',
                'hits_allowed', 'earned_runs', 'strikeouts', 'walks_allowed',
                'home_runs_allowed', 'wins', 'losses', 'saves'
            ];
            const values = [
                id, row.jugador_id, row.equipo_id || null, row.innings_pitched || 0,
                row.hits_allowed || 0, row.earned_runs || 0, row.strikeouts || 0,
                row.walks_allowed || 0, row.home_runs_allowed || 0, row.wins || 0,
                row.losses || 0, row.saves || 0
            ];
            if (hasPitchingTorneo) {
                columns.splice(1, 0, 'torneo_id');
                values.splice(1, 0, torneoId);
            }
            const placeholders = values.map((_, index) => `$${index + 1}`);
            await client.query(
                `INSERT INTO partido_jugador_pitcheo (${columns.join(', ')}, updated_at)
                 VALUES (${placeholders.join(', ')}, CURRENT_TIMESTAMP)`,
                values
            );
        }

        for (const row of defensa) {
            const columns = [
                'partido_id', 'jugador_id', 'equipo_id', 'posicion',
                'putouts', 'assists', 'errors', 'double_plays', 'passed_balls', 'chances'
            ];
            const values = [
                id, row.jugador_id, row.equipo_id || null, row.posicion || null,
                row.putouts || 0, row.assists || 0, row.errors || 0, row.double_plays || 0,
                row.passed_balls || 0, row.chances || 0
            ];
            if (hasDefensiveTorneo) {
                columns.splice(1, 0, 'torneo_id');
                values.splice(1, 0, torneoId);
            }
            const placeholders = values.map((_, index) => `$${index + 1}`);
            await client.query(
                `INSERT INTO partido_jugador_defensa (${columns.join(', ')}, updated_at)
                 VALUES (${placeholders.join(', ')}, CURRENT_TIMESTAMP)`,
                values
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Boxscore guardado correctamente' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error guardando boxscore:', error);
        next(error);
    } finally {
        client.release();
    }
}

// POST /api/partidos
async function crear(req, res, next) {
    try {
        const validation = validarCrearPartido(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const {
            equipo_local_id, equipo_visitante_id,
            carreras_local, carreras_visitante,
            innings_jugados, fecha_partido, hora, estado, torneo_id
        } = validation.sanitized;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const torneoIdFinal = hasPartidosTorneo ? await resolveTorneoId(torneo_id || null) : null;

        // Verificar que ambos equipos existen
        const equiposCheck = await pool.query(
            'SELECT id FROM equipos WHERE id IN ($1, $2)',
            [equipo_local_id, equipo_visitante_id]
        );
        if (equiposCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Uno o ambos equipos no existen' });
        }

        const insertColumns = [
            'equipo_local_id', 'equipo_visitante_id', 'carreras_local',
            'carreras_visitante', 'innings_jugados', 'fecha_partido', 'hora', 'estado'
        ];
        const insertValues = [
            equipo_local_id, equipo_visitante_id, carreras_local,
            carreras_visitante, innings_jugados, fecha_partido, hora, estado
        ];

        if (hasPartidosTorneo) {
            insertColumns.push('torneo_id');
            insertValues.push(torneoIdFinal);
        }

        const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ');
        const result = await pool.query(
            `INSERT INTO partidos (${insertColumns.join(', ')})
             VALUES (${placeholders}) RETURNING *`,
            insertValues
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando partido:', error);
        next(error);
    }
}

// PUT /api/partidos/:id
async function actualizar(req, res, next) {
    try {
        const { id } = req.params;

        const validation = validarActualizarPartido(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const {
            equipo_local_id, equipo_visitante_id,
            carreras_local, carreras_visitante,
            innings_jugados, fecha_partido, estado, torneo_id
        } = validation.sanitized;
        const hasPartidosTorneo = await hasColumn('partidos', 'torneo_id');
        const torneoIdFinal = hasPartidosTorneo ? await resolveTorneoId(torneo_id || null) : null;

        // Verificar que ambos equipos existen
        const equiposCheck = await pool.query(
            'SELECT id FROM equipos WHERE id IN ($1, $2)',
            [equipo_local_id, equipo_visitante_id]
        );
        if (equiposCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Uno o ambos equipos no existen' });
        }

        const updateAssignments = [
            'equipo_local_id = $1',
            'equipo_visitante_id = $2',
            'carreras_local = $3',
            'carreras_visitante = $4',
            'innings_jugados = $5',
            'fecha_partido = $6',
            'estado = $8'
        ];
        const updateParams = [
            equipo_local_id, equipo_visitante_id, carreras_local,
            carreras_visitante, innings_jugados, fecha_partido, id, estado
        ];

        if (hasPartidosTorneo) {
            updateAssignments.push(`torneo_id = $${updateParams.length + 1}`);
            updateParams.push(torneoIdFinal);
        }

        const result = await pool.query(
            `UPDATE partidos SET ${updateAssignments.join(', ')}
             WHERE id = $7 RETURNING *`,
            updateParams
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando partido:', error);
        next(error);
    }
}

// DELETE /api/partidos/:id
async function eliminar(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM partidos WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        res.json({ message: 'Partido eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando partido:', error);
        next(error);
    }
}

module.exports = {
    obtenerTodos,
    obtenerProximos,
    obtenerPorId,
    obtenerBoxscore,
    guardarBoxscore,
    crear,
    actualizar,
    eliminar
};

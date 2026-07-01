const pool = require('../config/database');
const estadisticasService = require('./estadisticas.service');
const { resolveTorneoId, obtenerCriteriosElegibilidad } = require('./torneos.service');

const POSITION_ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'SF', 'LF', 'CF', 'RF', 'OF', 'IF', 'UTIL'];

function normalizePosition(position) {
    const raw = String(position || '').trim().toUpperCase();
    if (!raw) return 'UTIL';
    if (['1B', '2B', '3B', 'SS', 'SF', 'LF', 'CF', 'RF', 'C', 'P'].includes(raw)) return raw;
    if (['OF', 'OUTFIELD'].includes(raw)) return 'OF';
    if (['IF', 'INFIELD'].includes(raw)) return 'IF';
    return raw;
}

function sortByPosition(a, b) {
    const indexA = POSITION_ORDER.indexOf(a.posicion);
    const indexB = POSITION_ORDER.indexOf(b.posicion);
    const safeIndexA = indexA === -1 ? POSITION_ORDER.length : indexA;
    const safeIndexB = indexB === -1 ? POSITION_ORDER.length : indexB;
    if (safeIndexA !== safeIndexB) return safeIndexA - safeIndexB;
    return String(a.posicion || '').localeCompare(String(b.posicion || ''), 'es');
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function groupByPosition(rows) {
    const groups = new Map();
    rows.forEach((row) => {
        const posicion = normalizePosition(row.posicion);
        if (!groups.has(posicion)) groups.set(posicion, []);
        groups.get(posicion).push({ ...row, posicion });
    });
    return groups;
}

function qualifyOffensiveRows(rows, options = {}) {
    const {
        minFloor = 8,
        share = 0.45,
        fixedThreshold = null
    } = options;
    const candidates = rows
        .map((row) => ({
            ...row,
            at_bats: toNumber(row.at_bats),
            hits: toNumber(row.hits),
            doubles: toNumber(row.doubles),
            triples: toNumber(row.triples),
            home_runs: toNumber(row.home_runs),
            rbi: toNumber(row.rbi),
            runs: toNumber(row.runs),
            walks: toNumber(row.walks),
            stolen_bases: toNumber(row.stolen_bases),
            avg: toNumber(row.avg),
            obp: toNumber(row.obp),
            slg: toNumber(row.slg),
            ops: toNumber(row.ops)
        }))
        .filter((row) => row.at_bats > 0);

    if (!candidates.length) {
        return { qualified: [], threshold: 0, candidates: [] };
    }

    const maxAtBats = Math.max(...candidates.map((row) => row.at_bats));
    const threshold = fixedThreshold !== null && fixedThreshold !== undefined
        ? Number(fixedThreshold)
        : Math.max(minFloor, Math.ceil(maxAtBats * share));
    let qualified = candidates.filter((row) => row.at_bats >= threshold);
    if (!qualified.length) qualified = candidates;

    return { qualified, threshold, candidates };
}

function qualifyPitchingRows(rows, options = {}) {
    const {
        minFloor = 4,
        share = 0.4,
        fixedThreshold = null
    } = options;
    const candidates = rows
        .map((row) => ({
            ...row,
            innings_pitched: toNumber(row.innings_pitched),
            wins: toNumber(row.wins),
            losses: toNumber(row.losses),
            saves: toNumber(row.saves),
            strikeouts: toNumber(row.strikeouts),
            era: toNumber(row.era),
            whip: toNumber(row.whip)
        }))
        .filter((row) => row.innings_pitched > 0);

    if (!candidates.length) {
        return { qualified: [], threshold: 0, candidates: [] };
    }

    const maxIp = Math.max(...candidates.map((row) => row.innings_pitched));
    const threshold = fixedThreshold !== null && fixedThreshold !== undefined
        ? Number(fixedThreshold)
        : Math.max(minFloor, Math.ceil(maxIp * share));
    let qualified = candidates.filter((row) => row.innings_pitched >= threshold);
    if (!qualified.length) qualified = candidates;

    return { qualified, threshold, candidates };
}

function qualifyDefensiveRows(rows, options = {}) {
    const {
        minFloor = 5,
        share = 0.35,
        fixedThreshold = null
    } = options;
    const candidates = rows
        .map((row) => ({
            ...row,
            chances: toNumber(row.chances),
            putouts: toNumber(row.putouts),
            assists: toNumber(row.assists),
            errors: toNumber(row.errors),
            fielding_percentage: toNumber(row.fielding_percentage)
        }))
        .filter((row) => row.chances > 0);

    if (!candidates.length) {
        return { qualified: [], threshold: 0, candidates: [] };
    }

    const maxChances = Math.max(...candidates.map((row) => row.chances));
    const threshold = fixedThreshold !== null && fixedThreshold !== undefined
        ? Number(fixedThreshold)
        : Math.max(minFloor, Math.ceil(maxChances * share));
    let qualified = candidates.filter((row) => row.chances >= threshold);
    if (!qualified.length) qualified = candidates;

    return { qualified, threshold, candidates };
}

function computeOffensiveChampion(rows, criteria = {}) {
    const { qualified, threshold } = qualifyOffensiveRows(rows, {
        fixedThreshold: criteria.min_ab_rate_stats
    });
    if (!qualified.length) return null;

    qualified.sort((a, b) =>
        toNumber(b.ops) - toNumber(a.ops) ||
        toNumber(b.avg) - toNumber(a.avg) ||
        toNumber(b.home_runs) - toNumber(a.home_runs) ||
        toNumber(b.rbi) - toNumber(a.rbi) ||
        toNumber(b.hits) - toNumber(a.hits) ||
        String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es')
    );

    return {
        ...qualified[0],
        lado: 'ofensiva',
        criterio: 'OPS',
        qualifying_min_ab: threshold
    };
}

function computeDefensiveChampion(rows, criteria = {}) {
    const { qualified, threshold } = qualifyDefensiveRows(rows, {
        fixedThreshold: criteria.min_chances_defense
    });
    if (!qualified.length) return null;

    qualified.sort((a, b) =>
        toNumber(b.fielding_percentage) - toNumber(a.fielding_percentage) ||
        toNumber(b.chances) - toNumber(a.chances) ||
        toNumber(a.errors) - toNumber(b.errors) ||
        (toNumber(b.putouts) + toNumber(b.assists)) - (toNumber(a.putouts) + toNumber(a.assists)) ||
        String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es')
    );

    return {
        ...qualified[0],
        lado: 'defensiva',
        criterio: 'FLD%',
        qualifying_min_chances: threshold
    };
}

function summarizeChampionsByPosition(rows, calculator, criteria = {}) {
    const groups = groupByPosition(rows);
    const results = [];

    groups.forEach((groupRows, posicion) => {
        const champion = calculator(groupRows, criteria);
        if (champion) {
            results.push({
                ...champion,
                posicion
            });
        }
    });

    return results.sort(sortByPosition);
}

async function obtenerCampeonesPorPosicion(torneoIdParam) {
    const torneoIdResolved = torneoIdParam === 'todos'
        ? 'todos'
        : await resolveTorneoId(torneoIdParam || null);
    const criterios = torneoIdResolved && torneoIdResolved !== 'todos'
        ? await obtenerCriteriosElegibilidad(torneoIdResolved)
        : {};

    const [ofensivas, defensivas, torneoInfo] = await Promise.all([
        estadisticasService.obtenerOfensivas({
            torneo_id: torneoIdResolved === 'todos' ? 'todos' : torneoIdResolved,
            min_at_bats: 0
        }),
        estadisticasService.obtenerDefensivas({
            torneo_id: torneoIdResolved === 'todos' ? 'todos' : torneoIdResolved
        }),
        torneoIdResolved && torneoIdResolved !== 'todos'
            ? pool.query('SELECT id, nombre, estado, activo FROM torneos WHERE id = $1 LIMIT 1', [torneoIdResolved])
            : Promise.resolve({ rows: [] })
    ]);

    return {
        torneo: torneoInfo.rows[0] || null,
        criterios,
        ofensivos: summarizeChampionsByPosition(ofensivas, computeOffensiveChampion, criterios),
        defensivos: summarizeChampionsByPosition(defensivas, computeDefensiveChampion, criterios)
    };
}

function computePitcherAward(rows, criteria = {}) {
    const { qualified, threshold } = qualifyPitchingRows(rows, {
        fixedThreshold: criteria.min_ip_pitcher_award ?? criteria.min_ip_rate_stats
    });
    if (!qualified.length) return null;

    qualified.sort((a, b) =>
        toNumber(b.wins) - toNumber(a.wins) ||
        toNumber(a.era) - toNumber(b.era) ||
        toNumber(b.strikeouts) - toNumber(a.strikeouts) ||
        toNumber(a.whip) - toNumber(b.whip) ||
        String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es')
    );

    return {
        ...qualified[0],
        criterio: 'W / ERA / K',
        qualifying_min_ip: threshold
    };
}

function computeOverallDefensiveAward(rows, criteria = {}) {
    const { qualified, threshold } = qualifyDefensiveRows(rows, {
        fixedThreshold: criteria.min_chances_defense
    });
    if (!qualified.length) return null;

    qualified.sort((a, b) =>
        toNumber(b.fielding_percentage) - toNumber(a.fielding_percentage) ||
        toNumber(b.chances) - toNumber(a.chances) ||
        toNumber(a.errors) - toNumber(b.errors) ||
        String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es')
    );

    return {
        ...qualified[0],
        criterio: 'FLD% / Chances',
        qualifying_min_chances: threshold
    };
}

async function obtenerPremiosOficialesTorneo(torneoIdParam) {
    const torneoIdResolved = torneoIdParam === 'todos'
        ? 'todos'
        : await resolveTorneoId(torneoIdParam || null);
    const criteriosConfigurados = torneoIdResolved && torneoIdResolved !== 'todos'
        ? await obtenerCriteriosElegibilidad(torneoIdResolved)
        : {};

    const [ofensivas, pitcheo, defensivas, champions] = await Promise.all([
        estadisticasService.obtenerOfensivas({
            torneo_id: torneoIdResolved === 'todos' ? 'todos' : torneoIdResolved,
            min_at_bats: 0
        }),
        estadisticasService.obtenerPitcheo({
            torneo_id: torneoIdResolved === 'todos' ? 'todos' : torneoIdResolved
        }),
        estadisticasService.obtenerDefensivas({
            torneo_id: torneoIdResolved === 'todos' ? 'todos' : torneoIdResolved
        }),
        obtenerCampeonesPorPosicion(torneoIdResolved)
    ]);

    const battingChampion = computeOffensiveChampion(ofensivas, criteriosConfigurados);
    const { qualified: qualifiedOffensiveRate, threshold: qualifyingMinAbRate } = qualifyOffensiveRows(ofensivas, {
        fixedThreshold: criteriosConfigurados.min_ab_rate_stats
    });
    const { qualified: qualifiedOffensiveCounting, threshold: qualifyingMinAbCounting } = qualifyOffensiveRows(ofensivas, {
        minFloor: 4,
        share: 0.2,
        fixedThreshold: criteriosConfigurados.min_ab_counting_stats
    });
    const { qualified: qualifiedOffensiveMvp, threshold: qualifyingMinAbMvp } = qualifyOffensiveRows(ofensivas, {
        fixedThreshold: criteriosConfigurados.min_ab_mvp ?? criteriosConfigurados.min_ab_rate_stats
    });
    qualifiedOffensiveMvp.sort((a, b) =>
        toNumber(b.ops) - toNumber(a.ops) ||
        toNumber(b.rbi) - toNumber(a.rbi) ||
        toNumber(b.home_runs) - toNumber(a.home_runs) ||
        toNumber(b.runs) - toNumber(a.runs) ||
        toNumber(b.avg) - toNumber(a.avg) ||
        String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es')
    );

    const mvp = qualifiedOffensiveMvp[0] || null;
    const pitcher = computePitcherAward(pitcheo, criteriosConfigurados);
    const goldGlove = computeOverallDefensiveAward(defensivas, criteriosConfigurados);
    const { qualified: qualifiedPitchingRate, threshold: qualifyingMinIpRate } = qualifyPitchingRows(pitcheo, {
        fixedThreshold: criteriosConfigurados.min_ip_rate_stats
    });
    const { qualified: qualifiedPitchingCounting, threshold: qualifyingMinIpCounting } = qualifyPitchingRows(pitcheo, {
        minFloor: 2,
        share: 0.15,
        fixedThreshold: criteriosConfigurados.min_ip_counting_stats
    });

    const topCategory = (rows, key, descending = true, limit = 1) => {
        const sorted = [...rows].sort((a, b) => {
            const diff = toNumber(b[key]) - toNumber(a[key]);
            if (!descending) {
                return -diff || String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es');
            }
            return diff || String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es');
        });
        return sorted.slice(0, limit);
    };

    return {
        torneo: champions.torneo,
        criterios: {
            min_ab_rate_stats: qualifyingMinAbRate,
            min_ab_counting_stats: qualifyingMinAbCounting,
            min_ab_mvp: qualifyingMinAbMvp,
            min_ip_rate_stats: qualifyingMinIpRate,
            min_ip_counting_stats: qualifyingMinIpCounting,
            min_ip_pitcher_award: pitcher?.qualifying_min_ip || criteriosConfigurados.min_ip_pitcher_award || qualifyingMinIpRate,
            min_chances_defense: goldGlove?.qualifying_min_chances || criteriosConfigurados.min_chances_defense || 0
        },
        resumen: {
            mvp: mvp ? { ...mvp, criterio: 'OPS / RBI / HR', qualifying_min_ab: qualifyingMinAbMvp } : null,
            bateo: battingChampion,
            pitcher,
            guante_oro: goldGlove
        },
        guantes_por_posicion: champions.defensivos,
        categorias: {
            ofensiva: {
                avg: topCategory(qualifiedOffensiveRate, 'avg'),
                obp: topCategory(qualifiedOffensiveRate, 'obp'),
                slg: topCategory(qualifiedOffensiveRate, 'slg'),
                ops: topCategory(qualifiedOffensiveRate, 'ops'),
                hits: topCategory(qualifiedOffensiveCounting, 'hits'),
                doubles: topCategory(qualifiedOffensiveCounting, 'doubles'),
                triples: topCategory(qualifiedOffensiveCounting, 'triples'),
                home_runs: topCategory(qualifiedOffensiveCounting, 'home_runs'),
                rbi: topCategory(qualifiedOffensiveCounting, 'rbi'),
                runs: topCategory(qualifiedOffensiveCounting, 'runs'),
                walks: topCategory(qualifiedOffensiveCounting, 'walks'),
                stolen_bases: topCategory(qualifiedOffensiveCounting, 'stolen_bases')
            },
            pitcheo: {
                wins: topCategory(qualifiedPitchingCounting, 'wins'),
                strikeouts: topCategory(qualifiedPitchingCounting, 'strikeouts'),
                saves: topCategory(qualifiedPitchingCounting, 'saves'),
                era: topCategory(qualifiedPitchingRate, 'era', false),
                whip: topCategory(qualifiedPitchingRate, 'whip', false)
            }
        }
    };
}

async function obtenerRowsHistoricosPosicionales() {
    const [offensiveRowsResult, defensiveRowsResult] = await Promise.all([
        pool.query(`
            SELECT
                eo.torneo_id,
                t.nombre AS torneo_nombre,
                j.id AS jugador_id,
                j.nombre AS jugador_nombre,
                j.posicion,
                COALESCE(e.nombre, 'Sin equipo') AS equipo_nombre,
                COALESCE(eo.at_bats, 0)::INT AS at_bats,
                COALESCE(eo.hits, 0)::INT AS hits,
                COALESCE(eo.home_runs, 0)::INT AS home_runs,
                COALESCE(eo.rbi, 0)::INT AS rbi,
                CASE
                    WHEN COALESCE(eo.at_bats, 0) > 0 THEN ROUND(eo.hits::NUMERIC / eo.at_bats, 3)
                    ELSE 0
                END AS avg,
                CASE
                    WHEN (COALESCE(eo.at_bats, 0) + COALESCE(eo.walks, 0) + COALESCE(eo.hit_by_pitch, 0) + COALESCE(eo.sacrifice_flies, 0)) > 0
                    THEN ROUND(
                        (COALESCE(eo.hits, 0) + COALESCE(eo.walks, 0) + COALESCE(eo.hit_by_pitch, 0))::NUMERIC /
                        NULLIF(COALESCE(eo.at_bats, 0) + COALESCE(eo.walks, 0) + COALESCE(eo.hit_by_pitch, 0) + COALESCE(eo.sacrifice_flies, 0), 0),
                        3
                    )
                    ELSE 0
                END AS obp,
                CASE
                    WHEN COALESCE(eo.at_bats, 0) > 0
                    THEN ROUND(
                        (
                            (COALESCE(eo.hits, 0) - COALESCE(eo.doubles, 0) - COALESCE(eo.triples, 0) - COALESCE(eo.home_runs, 0))
                            + (2 * COALESCE(eo.doubles, 0))
                            + (3 * COALESCE(eo.triples, 0))
                            + (4 * COALESCE(eo.home_runs, 0))
                        )::NUMERIC / eo.at_bats,
                        3
                    )
                    ELSE 0
                END AS slg
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON j.id = eo.jugador_id
            LEFT JOIN equipos e ON e.id = j.equipo_id
            LEFT JOIN torneos t ON t.id = eo.torneo_id
            WHERE eo.torneo_id IS NOT NULL
              AND COALESCE(TRIM(j.posicion), '') <> ''
        `),
        pool.query(`
            SELECT
                ed.torneo_id,
                t.nombre AS torneo_nombre,
                j.id AS jugador_id,
                j.nombre AS jugador_nombre,
                j.posicion,
                COALESCE(e.nombre, 'Sin equipo') AS equipo_nombre,
                COALESCE(ed.putouts, 0)::INT AS putouts,
                COALESCE(ed.assists, 0)::INT AS assists,
                COALESCE(ed.errors, 0)::INT AS errors,
                COALESCE(ed.chances, 0)::INT AS chances,
                CASE
                    WHEN COALESCE(ed.chances, 0) > 0
                    THEN ROUND((COALESCE(ed.putouts, 0) + COALESCE(ed.assists, 0))::NUMERIC / ed.chances, 3)
                    ELSE 0
                END AS fielding_percentage
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON j.id = ed.jugador_id
            LEFT JOIN equipos e ON e.id = j.equipo_id
            LEFT JOIN torneos t ON t.id = ed.torneo_id
            WHERE ed.torneo_id IS NOT NULL
              AND COALESCE(TRIM(j.posicion), '') <> ''
        `)
    ]);

    return {
        offensiveRows: offensiveRowsResult.rows.map((row) => ({
            ...row,
            ops: Number((toNumber(row.obp) + toNumber(row.slg)).toFixed(3))
        })),
        defensiveRows: defensiveRowsResult.rows
    };
}

function construirPremiosHistoricos(offensiveRows, defensiveRows) {
    const offensiveByTournament = new Map();
    const defensiveByTournament = new Map();

    offensiveRows.forEach((row) => {
        const key = `${row.torneo_id}`;
        if (!offensiveByTournament.has(key)) offensiveByTournament.set(key, []);
        offensiveByTournament.get(key).push(row);
    });

    defensiveRows.forEach((row) => {
        const key = `${row.torneo_id}`;
        if (!defensiveByTournament.has(key)) defensiveByTournament.set(key, []);
        defensiveByTournament.get(key).push(row);
    });

    const awardsMap = new Map();

    const registerAward = (winner, side, tournamentName) => {
        if (!winner?.jugador_id) return;
        const key = `${side}:${winner.posicion}:${winner.jugador_id}`;
        if (!awardsMap.has(key)) {
            awardsMap.set(key, {
                jugador_id: winner.jugador_id,
                jugador_nombre: winner.jugador_nombre,
                equipo_nombre: winner.equipo_nombre,
                posicion: winner.posicion,
                lado: side,
                titulos: 0,
                ultimo_torneo: tournamentName || null
            });
        }
        const entry = awardsMap.get(key);
        entry.titulos += 1;
        entry.ultimo_torneo = tournamentName || entry.ultimo_torneo;
    };

    offensiveByTournament.forEach((rows, tournamentKey) => {
        const champions = summarizeChampionsByPosition(rows, computeOffensiveChampion);
        const tournamentName = rows[0]?.torneo_nombre || tournamentKey;
        champions.forEach((winner) => registerAward(winner, 'ofensiva', tournamentName));
    });

    defensiveByTournament.forEach((rows, tournamentKey) => {
        const champions = summarizeChampionsByPosition(rows, computeDefensiveChampion);
        const tournamentName = rows[0]?.torneo_nombre || tournamentKey;
        champions.forEach((winner) => registerAward(winner, 'defensiva', tournamentName));
    });

    return awardsMap;
}

async function obtenerPalmaresHistoricoPosicional() {
    const { offensiveRows, defensiveRows } = await obtenerRowsHistoricosPosicionales();
    const awardsMap = construirPremiosHistoricos(offensiveRows, defensiveRows);

    return Array.from(awardsMap.values())
        .sort((a, b) =>
            b.titulos - a.titulos ||
            String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es')
        )
        .slice(0, 12);
}

async function obtenerPalmaresJugador(jugadorId) {
    const { offensiveRows, defensiveRows } = await obtenerRowsHistoricosPosicionales();
    const awards = Array.from(construirPremiosHistoricos(offensiveRows, defensiveRows).values())
        .filter((entry) => Number(entry.jugador_id) === Number(jugadorId))
        .sort((a, b) => b.titulos - a.titulos || String(a.lado).localeCompare(String(b.lado), 'es'));

    return {
        total: awards.reduce((sum, item) => sum + Number(item.titulos || 0), 0),
        ofensivos: awards.filter((item) => item.lado === 'ofensiva').reduce((sum, item) => sum + Number(item.titulos || 0), 0),
        defensivos: awards.filter((item) => item.lado === 'defensiva').reduce((sum, item) => sum + Number(item.titulos || 0), 0),
        detalle: awards
    };
}

async function obtenerPalmaresEquipo(equipoNombre) {
    const { offensiveRows, defensiveRows } = await obtenerRowsHistoricosPosicionales();
    const normalizedName = String(equipoNombre || '').trim().toUpperCase();
    const awards = Array.from(construirPremiosHistoricos(offensiveRows, defensiveRows).values())
        .filter((entry) => String(entry.equipo_nombre || '').trim().toUpperCase() === normalizedName)
        .sort((a, b) => b.titulos - a.titulos || String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es'));

    return {
        total: awards.reduce((sum, item) => sum + Number(item.titulos || 0), 0),
        detalle: awards
    };
}

async function obtenerLideresHistoricosCategorias() {
    const [battingResult, pitchingResult, defensiveResult] = await Promise.all([
        pool.query(`
            SELECT
                j.id AS jugador_id,
                j.nombre AS jugador_nombre,
                j.posicion,
                COALESCE(e.nombre, 'Sin equipo') AS equipo_nombre,
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
            FROM jugadores j
            JOIN estadisticas_ofensivas eo ON eo.jugador_id = j.id
            LEFT JOIN equipos e ON e.id = j.equipo_id
            GROUP BY j.id, j.nombre, j.posicion, e.nombre
            HAVING COALESCE(SUM(eo.at_bats), 0) > 0
        `),
        pool.query(`
            SELECT
                j.id AS jugador_id,
                j.nombre AS jugador_nombre,
                j.posicion,
                COALESCE(e.nombre, 'Sin equipo') AS equipo_nombre,
                COALESCE(SUM(ep.innings_pitched), 0)::NUMERIC AS innings_pitched,
                COALESCE(SUM(ep.wins), 0)::INT AS wins,
                COALESCE(SUM(ep.strikeouts), 0)::INT AS strikeouts,
                COALESCE(SUM(ep.saves), 0)::INT AS saves,
                CASE
                    WHEN COALESCE(SUM(ep.innings_pitched), 0) > 0
                    THEN ROUND((COALESCE(SUM(ep.earned_runs), 0)::NUMERIC * 9) / SUM(ep.innings_pitched), 2)
                    ELSE 0
                END AS era,
                CASE
                    WHEN COALESCE(SUM(ep.innings_pitched), 0) > 0
                    THEN ROUND((COALESCE(SUM(ep.walks_allowed), 0) + COALESCE(SUM(ep.hits_allowed), 0))::NUMERIC / SUM(ep.innings_pitched), 2)
                    ELSE 0
                END AS whip
            FROM jugadores j
            JOIN estadisticas_pitcheo ep ON ep.jugador_id = j.id
            LEFT JOIN equipos e ON e.id = j.equipo_id
            GROUP BY j.id, j.nombre, j.posicion, e.nombre
            HAVING COALESCE(SUM(ep.innings_pitched), 0) > 0
        `),
        pool.query(`
            SELECT
                j.id AS jugador_id,
                j.nombre AS jugador_nombre,
                j.posicion,
                COALESCE(e.nombre, 'Sin equipo') AS equipo_nombre,
                COALESCE(SUM(ed.putouts), 0)::INT AS putouts,
                COALESCE(SUM(ed.assists), 0)::INT AS assists,
                COALESCE(SUM(ed.errors), 0)::INT AS errors,
                COALESCE(SUM(ed.chances), 0)::INT AS chances,
                CASE
                    WHEN COALESCE(SUM(ed.chances), 0) > 0
                    THEN ROUND((COALESCE(SUM(ed.putouts), 0) + COALESCE(SUM(ed.assists), 0))::NUMERIC / SUM(ed.chances), 3)
                    ELSE 0
                END AS fielding_percentage
            FROM jugadores j
            JOIN estadisticas_defensivas ed ON ed.jugador_id = j.id
            LEFT JOIN equipos e ON e.id = j.equipo_id
            GROUP BY j.id, j.nombre, j.posicion, e.nombre
            HAVING COALESCE(SUM(ed.chances), 0) > 0
        `)
    ]);

    const battingRows = battingResult.rows.map((row) => ({
        ...row,
        ops: Number((toNumber(row.obp) + toNumber(row.slg)).toFixed(3))
    }));
    const pitchingRows = pitchingResult.rows;
    const defensiveRows = defensiveResult.rows;
    const historicalRows = await obtenerRowsHistoricosPosicionales();
    const fullAwards = Array.from(
        construirPremiosHistoricos(historicalRows.offensiveRows, historicalRows.defensiveRows).values()
    );

    const top = (rows, key, descending = true, limit = 5) => {
        const sorted = [...rows].sort((a, b) => {
            const diff = toNumber(b[key]) - toNumber(a[key]);
            if (!descending) {
                return -diff || String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es');
            }
            return diff || String(a.jugador_nombre || '').localeCompare(String(b.jugador_nombre || ''), 'es');
        });
        return sorted.slice(0, limit);
    };

    return {
        bateo: {
            avg: top(battingRows.filter((row) => toNumber(row.at_bats) >= 20), 'avg'),
            home_runs: top(battingRows, 'home_runs'),
            rbi: top(battingRows, 'rbi'),
            hits: top(battingRows, 'hits'),
            doubles: top(battingRows, 'doubles'),
            triples: top(battingRows, 'triples'),
            ops: top(battingRows.filter((row) => toNumber(row.at_bats) >= 20), 'ops'),
            stolen_bases: top(battingRows, 'stolen_bases')
        },
        pitcheo: {
            wins: top(pitchingRows, 'wins'),
            strikeouts: top(pitchingRows, 'strikeouts'),
            saves: top(pitchingRows, 'saves'),
            era: top(pitchingRows.filter((row) => toNumber(row.innings_pitched) >= 10), 'era', false),
            whip: top(pitchingRows.filter((row) => toNumber(row.innings_pitched) >= 10), 'whip', false)
        },
        defensa: {
            fielding_percentage: top(defensiveRows.filter((row) => toNumber(row.chances) >= 20), 'fielding_percentage'),
            putouts: top(defensiveRows, 'putouts'),
            assists: top(defensiveRows, 'assists'),
            chances: top(defensiveRows, 'chances')
        },
        posiciones: {
            ofensiva: fullAwards
                .filter((row) => row.lado === 'ofensiva')
                .sort((a, b) => Number(b.titulos || 0) - Number(a.titulos || 0) || String(a.posicion || '').localeCompare(String(b.posicion || ''), 'es'))
                .slice(0, 12),
            defensiva: fullAwards
                .filter((row) => row.lado === 'defensiva')
                .sort((a, b) => Number(b.titulos || 0) - Number(a.titulos || 0) || String(a.posicion || '').localeCompare(String(b.posicion || ''), 'es'))
                .slice(0, 12)
        }
    };
}

module.exports = {
    obtenerCampeonesPorPosicion,
    obtenerPalmaresHistoricoPosicional,
    obtenerPalmaresJugador,
    obtenerPalmaresEquipo,
    obtenerLideresHistoricosCategorias,
    obtenerPremiosOficialesTorneo
};

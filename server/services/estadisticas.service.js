/**
 * Service de Estadísticas
 * Lógica de negocio para estadísticas ofensivas, pitcheo y defensivas
 */
const pool = require('../config/database');
const { calcularStatsOfensivas, calcularStatsPitcheo, calcularStatsDefensivas } = require('../utils/calculations');
const { resolveTorneoId } = require('./torneos.service');

// ============================================================
// ESTADÍSTICAS OFENSIVAS
// ============================================================

/**
 * Obtener estadísticas ofensivas con filtros
 * @param {object} filtros - { torneo_id, equipo_id, jugador_id, min_at_bats }
 * @returns {Array}
 */
async function obtenerOfensivas(filtros = {}) {
    const { torneo_id, equipo_id, jugador_id, min_at_bats = 0 } = filtros;

    // Modo "todos": sumar estadísticas de todos los torneos por jugador
    if (torneo_id === 'todos') {
        let query = `
            SELECT
                eo.jugador_id,
                j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre,
                SUM(eo.at_bats)::INT as at_bats,
                SUM(eo.hits)::INT as hits,
                SUM(eo.doubles)::INT as doubles,
                SUM(eo.triples)::INT as triples,
                SUM(eo.home_runs)::INT as home_runs,
                SUM(eo.rbi)::INT as rbi,
                SUM(eo.runs)::INT as runs,
                SUM(eo.walks)::INT as walks,
                SUM(COALESCE(eo.strikeouts, 0))::INT as strikeouts,
                SUM(eo.stolen_bases)::INT as stolen_bases,
                SUM(eo.caught_stealing)::INT as caught_stealing,
                SUM(eo.hit_by_pitch)::INT as hit_by_pitch,
                SUM(eo.sacrifice_flies)::INT as sacrifice_flies,
                CASE
                    WHEN SUM(eo.at_bats) > 0 THEN ROUND(SUM(eo.hits)::DECIMAL / SUM(eo.at_bats), 3)
                    ELSE 0.000
                END as avg,
                CASE
                    WHEN SUM(eo.at_bats) > 0 THEN ROUND((SUM(eo.hits) + SUM(eo.walks))::DECIMAL / (SUM(eo.at_bats) + SUM(eo.walks)), 3)
                    ELSE 0.000
                END as obp,
                CASE
                    WHEN SUM(eo.at_bats) > 0 THEN ROUND((SUM(eo.hits) + SUM(eo.home_runs) * 3)::DECIMAL / SUM(eo.at_bats), 3)
                    ELSE 0.000
                END as slg
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON eo.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE SUM(eo.at_bats) >= 0
            GROUP BY eo.jugador_id, j.nombre, j.posicion, j.equipo_id, e.nombre
        `;
        // WHERE con HAVING para min_at_bats en GROUP BY
        query = `
            SELECT * FROM (
                SELECT
                    eo.jugador_id,
                    j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre,
                    SUM(eo.at_bats)::INT as at_bats,
                    SUM(eo.hits)::INT as hits,
                    SUM(eo.doubles)::INT as doubles,
                    SUM(eo.triples)::INT as triples,
                    SUM(eo.home_runs)::INT as home_runs,
                    SUM(eo.rbi)::INT as rbi,
                    SUM(eo.runs)::INT as runs,
                    SUM(eo.walks)::INT as walks,
                    SUM(COALESCE(eo.strikeouts, 0))::INT as strikeouts,
                    SUM(eo.stolen_bases)::INT as stolen_bases,
                    SUM(eo.caught_stealing)::INT as caught_stealing,
                    SUM(eo.hit_by_pitch)::INT as hit_by_pitch,
                    SUM(eo.sacrifice_flies)::INT as sacrifice_flies,
                    CASE
                        WHEN SUM(eo.at_bats) > 0 THEN ROUND(SUM(eo.hits)::DECIMAL / SUM(eo.at_bats), 3)
                        ELSE 0.000
                    END as avg,
                    CASE
                        WHEN SUM(eo.at_bats) > 0 THEN ROUND((SUM(eo.hits) + SUM(eo.walks))::DECIMAL / (SUM(eo.at_bats) + SUM(eo.walks)), 3)
                        ELSE 0.000
                    END as obp,
                    CASE
                        WHEN SUM(eo.at_bats) > 0 THEN ROUND((SUM(eo.hits) + SUM(eo.home_runs) * 3)::DECIMAL / SUM(eo.at_bats), 3)
                        ELSE 0.000
                    END as slg
                FROM estadisticas_ofensivas eo
                JOIN jugadores j ON eo.jugador_id = j.id
                JOIN equipos e ON j.equipo_id = e.id
                GROUP BY eo.jugador_id, j.nombre, j.posicion, j.equipo_id, e.nombre
            ) sub
            WHERE at_bats >= $1
            ORDER BY avg DESC, hits DESC
        `;

        const params = [min_at_bats];
        let paramIndex = 2;

        // Filtros adicionales no aplican en la subquery, se pueden agregar al WHERE externo si es necesario

        const result = await pool.query(query, params);
        return result.rows.map(jugador => ({
            ...jugador,
            ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3))
        }));
    }

    // Modo normal: filtrar por torneo específico o activo
    const torneoIdResolved = torneo_id || await resolveTorneoId(null);

    let query = `
        SELECT
               eo.*,
               COALESCE(eo.strikeouts, 0)::INT as strikeouts,
               j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre,
               CASE
                   WHEN eo.at_bats > 0 THEN ROUND(eo.hits::DECIMAL / eo.at_bats, 3)
                   ELSE 0.000
               END as avg,
               CASE
                   WHEN eo.at_bats > 0 THEN ROUND((eo.hits + eo.walks)::DECIMAL / (eo.at_bats + eo.walks), 3)
                   ELSE 0.000
               END as obp,
               CASE
                   WHEN eo.at_bats > 0 THEN ROUND((eo.hits + eo.home_runs * 3)::DECIMAL / eo.at_bats, 3)
                   ELSE 0.000
               END as slg
        FROM estadisticas_ofensivas eo
        JOIN jugadores j ON eo.jugador_id = j.id
        JOIN equipos e ON j.equipo_id = e.id
        WHERE eo.at_bats >= $1
    `;
    const params = [min_at_bats];
    let paramIndex = 2;

    if (torneoIdResolved) {
        query += ` AND eo.torneo_id = $${paramIndex}`;
        params.push(torneoIdResolved);
        paramIndex++;
    }

    if (jugador_id) {
        query += ` AND eo.jugador_id = $${paramIndex}`;
        params.push(jugador_id);
        paramIndex++;
    }

    if (equipo_id) {
        query += ` AND j.equipo_id = $${paramIndex}`;
        params.push(equipo_id);
    }

    query += ` ORDER BY avg DESC, eo.hits DESC`;

    const result = await pool.query(query, params);

    // Agregar OPS calculado
    return result.rows.map(jugador => ({
        ...jugador,
        ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3))
    }));
}

/**
 * Upsert estadísticas ofensivas de un jugador
 * @param {number} jugadorId
 * @param {number} torneoId
 * @param {object} stats - datos crudos de estadísticas
 * @returns {object} - registro actualizado
 */
async function upsertOfensivas(jugadorId, torneoId, stats) {
    const {
        at_bats = 0, hits = 0, home_runs = 0, rbi = 0, runs = 0,
        walks = 0, stolen_bases = 0, strikeouts = 0, doubles = 0,
        triples = 0, caught_stealing = 0, hit_by_pitch = 0,
        sacrifice_flies = 0, sacrifice_hits = 0
    } = stats;

    const query = `
        INSERT INTO estadisticas_ofensivas (
            jugador_id, torneo_id, at_bats, hits, home_runs, rbi, runs,
            walks, stolen_bases, strikeouts, doubles, triples,
            caught_stealing, hit_by_pitch, sacrifice_flies, sacrifice_hits,
            fecha_actualizacion
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
        ON CONFLICT (jugador_id, torneo_id)
        DO UPDATE SET
            at_bats = EXCLUDED.at_bats,
            hits = EXCLUDED.hits,
            home_runs = EXCLUDED.home_runs,
            rbi = EXCLUDED.rbi,
            runs = EXCLUDED.runs,
            walks = EXCLUDED.walks,
            stolen_bases = EXCLUDED.stolen_bases,
            strikeouts = EXCLUDED.strikeouts,
            doubles = EXCLUDED.doubles,
            triples = EXCLUDED.triples,
            caught_stealing = EXCLUDED.caught_stealing,
            hit_by_pitch = EXCLUDED.hit_by_pitch,
            sacrifice_flies = EXCLUDED.sacrifice_flies,
            sacrifice_hits = EXCLUDED.sacrifice_hits,
            fecha_actualizacion = CURRENT_TIMESTAMP
        RETURNING *`;

    const values = [
        parseInt(jugadorId), torneoId, parseInt(at_bats), parseInt(hits),
        parseInt(home_runs), parseInt(rbi), parseInt(runs), parseInt(walks),
        parseInt(stolen_bases), parseInt(strikeouts), parseInt(doubles),
        parseInt(triples), parseInt(caught_stealing), parseInt(hit_by_pitch),
        parseInt(sacrifice_flies), parseInt(sacrifice_hits)
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
}

// ============================================================
// ESTADÍSTICAS DE PITCHEO
// ============================================================

/**
 * Obtener estadísticas de pitcheo con filtros
 * @param {object} filtros - { torneo_id, equipo_id, jugador_id }
 * @returns {Array}
 */
async function obtenerPitcheo(filtros = {}) {
    const { torneo_id, equipo_id, jugador_id } = filtros;

    // Modo "todos": sumar estadísticas de todos los torneos por jugador
    if (torneo_id === 'todos') {
        const query = `
            SELECT
                ep.jugador_id,
                j.nombre as jugador_nombre, j.equipo_id, e.nombre as equipo_nombre,
                SUM(ep.innings_pitched)::NUMERIC as innings_pitched,
                SUM(ep.hits_allowed)::INT as hits_allowed,
                SUM(ep.earned_runs)::INT as earned_runs,
                SUM(ep.strikeouts)::INT as strikeouts,
                SUM(ep.walks_allowed)::INT as walks_allowed,
                SUM(ep.home_runs_allowed)::INT as home_runs_allowed,
                SUM(ep.wins)::INT as wins,
                SUM(ep.losses)::INT as losses,
                SUM(ep.saves)::INT as saves,
                CASE
                    WHEN SUM(ep.innings_pitched) > 0 THEN ROUND((SUM(ep.earned_runs) * 9.0) / SUM(ep.innings_pitched), 2)
                    ELSE 0.00
                END as era,
                CASE
                    WHEN SUM(ep.innings_pitched) > 0 THEN ROUND((SUM(ep.hits_allowed) + SUM(ep.walks_allowed)) / SUM(ep.innings_pitched), 2)
                    ELSE 0.00
                END as whip
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            GROUP BY ep.jugador_id, j.nombre, j.equipo_id, e.nombre
            ORDER BY era ASC
        `;
        const result = await pool.query(query);
        return result.rows;
    }

    // Modo normal
    const torneoIdResolved = torneo_id || await resolveTorneoId(null);
    let paramIndex = 1;
    const params = [];

    let query = `
        SELECT ep.*, j.nombre as jugador_nombre, j.equipo_id, e.nombre as equipo_nombre,
               CASE
                   WHEN ep.innings_pitched > 0 THEN ROUND((ep.earned_runs * 9.0) / ep.innings_pitched, 2)
                   ELSE 0.00
               END as era,
               CASE
                   WHEN ep.innings_pitched > 0 THEN ROUND((ep.hits_allowed + ep.walks_allowed) / ep.innings_pitched, 2)
                   ELSE 0.00
               END as whip
        FROM estadisticas_pitcheo ep
        JOIN jugadores j ON ep.jugador_id = j.id
        JOIN equipos e ON j.equipo_id = e.id
        WHERE 1=1
    `;

    if (torneoIdResolved) {
        query += ` AND ep.torneo_id = $${paramIndex}`;
        params.push(torneoIdResolved);
        paramIndex++;
    }

    if (jugador_id) {
        query += ` AND ep.jugador_id = $${paramIndex}`;
        params.push(jugador_id);
        paramIndex++;
    }

    if (equipo_id) {
        query += ` AND j.equipo_id = $${paramIndex}`;
        params.push(equipo_id);
    }

    query += ' ORDER BY era ASC';

    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Obtener pitcheo de un jugador específico
 * @param {number} jugadorId
 * @param {number|null} torneoId
 * @returns {object|null}
 */
async function obtenerPitcheoPorJugador(jugadorId, torneoId) {
    const torneoIdResolved = torneoId || await resolveTorneoId(null);

    let query = `
        SELECT ep.*, j.nombre as jugador_nombre, j.equipo_id, e.nombre as equipo_nombre
        FROM estadisticas_pitcheo ep
        JOIN jugadores j ON ep.jugador_id = j.id
        JOIN equipos e ON j.equipo_id = e.id
        WHERE ep.jugador_id = $1
    `;
    const params = [jugadorId];

    if (torneoIdResolved) {
        query += ' AND ep.torneo_id = $2';
        params.push(torneoIdResolved);
    }

    const result = await pool.query(query, params);
    return result.rows[0] || null;
}

/**
 * Crear/actualizar estadísticas de pitcheo (upsert)
 * @param {number} jugadorId
 * @param {number} torneoId
 * @param {object} stats
 * @returns {object}
 */
async function upsertPitcheo(jugadorId, torneoId, stats) {
    const {
        innings_pitched = 0, hits_allowed = 0, earned_runs = 0,
        strikeouts = 0, walks_allowed = 0, home_runs_allowed = 0,
        wins = 0, losses = 0, saves = 0
    } = stats;

    const result = await pool.query(`
        INSERT INTO estadisticas_pitcheo (
            jugador_id, torneo_id, innings_pitched, hits_allowed, earned_runs,
            strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (jugador_id, torneo_id)
        DO UPDATE SET
            innings_pitched = EXCLUDED.innings_pitched,
            hits_allowed = EXCLUDED.hits_allowed,
            earned_runs = EXCLUDED.earned_runs,
            strikeouts = EXCLUDED.strikeouts,
            walks_allowed = EXCLUDED.walks_allowed,
            home_runs_allowed = EXCLUDED.home_runs_allowed,
            wins = EXCLUDED.wins,
            losses = EXCLUDED.losses,
            saves = EXCLUDED.saves
        RETURNING *
    `, [jugadorId, torneoId, innings_pitched || 0, hits_allowed || 0,
        earned_runs || 0, strikeouts || 0, walks_allowed || 0, home_runs_allowed || 0,
        wins || 0, losses || 0, saves || 0]);

    return result.rows[0];
}

/**
 * Actualizar estadísticas de pitcheo (solo UPDATE, no INSERT)
 * @param {number} jugadorId
 * @param {number} torneoId
 * @param {object} stats
 * @returns {object|null}
 */
async function actualizarPitcheo(jugadorId, torneoId, stats) {
    const {
        innings_pitched = 0, hits_allowed = 0, earned_runs = 0,
        strikeouts = 0, walks_allowed = 0, home_runs_allowed = 0,
        wins = 0, losses = 0, saves = 0
    } = stats;

    const result = await pool.query(`
        UPDATE estadisticas_pitcheo SET
            innings_pitched = $1, hits_allowed = $2, earned_runs = $3,
            strikeouts = $4, walks_allowed = $5, home_runs_allowed = $6,
            wins = $7, losses = $8, saves = $9
        WHERE jugador_id = $10 AND torneo_id = $11
        RETURNING *
    `, [innings_pitched || 0, hits_allowed || 0, earned_runs || 0, strikeouts || 0,
        walks_allowed || 0, home_runs_allowed || 0, wins || 0, losses || 0,
        saves || 0, jugadorId, torneoId]);

    return result.rows[0] || null;
}

// ============================================================
// ESTADÍSTICAS DEFENSIVAS
// ============================================================

/**
 * Obtener estadísticas defensivas con filtros
 * @param {object} filtros - { torneo_id, equipo_id, jugador_id }
 * @returns {Array}
 */
async function obtenerDefensivas(filtros = {}) {
    const { torneo_id, equipo_id, jugador_id } = filtros;

    // Modo "todos": sumar estadísticas de todos los torneos por jugador
    if (torneo_id === 'todos') {
        const query = `
            SELECT
                ed.jugador_id,
                j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre,
                SUM(ed.putouts)::INT as putouts,
                SUM(ed.assists)::INT as assists,
                SUM(ed.errors)::INT as errors,
                SUM(ed.double_plays)::INT as double_plays,
                SUM(ed.passed_balls)::INT as passed_balls,
                SUM(ed.chances)::INT as chances,
                CASE
                    WHEN SUM(ed.chances) > 0 THEN ROUND((SUM(ed.putouts) + SUM(ed.assists))::DECIMAL / SUM(ed.chances), 3)
                    ELSE 0.000
                END as fielding_percentage
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            GROUP BY ed.jugador_id, j.nombre, j.posicion, j.equipo_id, e.nombre
            ORDER BY fielding_percentage DESC
        `;
        const result = await pool.query(query);
        return result.rows;
    }

    // Modo normal
    const torneoIdResolved = torneo_id || await resolveTorneoId(null);
    let paramIndex = 1;
    const params = [];

    let query = `
        SELECT ed.*, j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre,
               CASE
                   WHEN ed.chances > 0 THEN ROUND((ed.putouts + ed.assists)::DECIMAL / ed.chances, 3)
                   ELSE 0.000
               END as fielding_percentage
        FROM estadisticas_defensivas ed
        JOIN jugadores j ON ed.jugador_id = j.id
        JOIN equipos e ON j.equipo_id = e.id
        WHERE 1=1
    `;

    if (torneoIdResolved) {
        query += ` AND ed.torneo_id = $${paramIndex}`;
        params.push(torneoIdResolved);
        paramIndex++;
    }

    if (jugador_id) {
        query += ` AND ed.jugador_id = $${paramIndex}`;
        params.push(jugador_id);
        paramIndex++;
    }

    if (equipo_id) {
        query += ` AND j.equipo_id = $${paramIndex}`;
        params.push(equipo_id);
    }

    query += ' ORDER BY fielding_percentage DESC';

    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Obtener defensivas de un jugador específico
 */
async function obtenerDefensivasPorJugador(jugadorId, torneoId) {
    const torneoIdResolved = torneoId || await resolveTorneoId(null);

    let query = `
        SELECT ed.*, j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre
        FROM estadisticas_defensivas ed
        JOIN jugadores j ON ed.jugador_id = j.id
        JOIN equipos e ON j.equipo_id = e.id
        WHERE ed.jugador_id = $1
    `;
    const params = [jugadorId];

    if (torneoIdResolved) {
        query += ' AND ed.torneo_id = $2';
        params.push(torneoIdResolved);
    }

    const result = await pool.query(query, params);
    return result.rows[0] || null;
}

/**
 * Crear/actualizar estadísticas defensivas (upsert)
 */
async function upsertDefensivas(jugadorId, torneoId, stats) {
    const {
        putouts = 0, assists = 0, errors = 0,
        double_plays = 0, passed_balls = 0, chances = 0
    } = stats;

    const result = await pool.query(`
        INSERT INTO estadisticas_defensivas (
            jugador_id, torneo_id, putouts, assists, errors,
            double_plays, passed_balls, chances
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (jugador_id, torneo_id)
        DO UPDATE SET
            putouts = EXCLUDED.putouts,
            assists = EXCLUDED.assists,
            errors = EXCLUDED.errors,
            double_plays = EXCLUDED.double_plays,
            passed_balls = EXCLUDED.passed_balls,
            chances = EXCLUDED.chances
        RETURNING *
    `, [jugadorId, torneoId, putouts || 0, assists || 0,
        errors || 0, double_plays || 0, passed_balls || 0, chances || 0]);

    return result.rows[0];
}

/**
 * Actualizar estadísticas defensivas (solo UPDATE)
 */
async function actualizarDefensivas(jugadorId, torneoId, stats) {
    const {
        putouts = 0, assists = 0, errors = 0,
        double_plays = 0, passed_balls = 0, chances = 0
    } = stats;

    const result = await pool.query(`
        UPDATE estadisticas_defensivas SET
            putouts = $1, assists = $2, errors = $3, double_plays = $4,
            passed_balls = $5, chances = $6
        WHERE jugador_id = $7 AND torneo_id = $8
        RETURNING *
    `, [putouts || 0, assists || 0, errors || 0, double_plays || 0,
        passed_balls || 0, chances || 0, jugadorId, torneoId]);

    return result.rows[0] || null;
}

module.exports = {
    // Ofensivas
    obtenerOfensivas,
    upsertOfensivas,

    // Pitcheo
    obtenerPitcheo,
    obtenerPitcheoPorJugador,
    upsertPitcheo,
    actualizarPitcheo,

    // Defensivas
    obtenerDefensivas,
    obtenerDefensivasPorJugador,
    upsertDefensivas,
    actualizarDefensivas
};

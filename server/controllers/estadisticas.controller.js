const pool = require('../config/database');

// ============================================================
// Funcion auxiliar: Resolver torneo_id
// Reemplaza resolveTemporada() del server.js original
// ============================================================
async function resolveTorneoId(torneo_id) {
    if (torneo_id && !isNaN(parseInt(torneo_id))) {
        return parseInt(torneo_id);
    }
    // Si no se provee torneo_id, buscar el torneo activo
    const result = await pool.query('SELECT id FROM torneos WHERE activo = true LIMIT 1');
    if (result.rows.length > 0) {
        return result.rows[0].id;
    }
    // Fallback: el torneo mas reciente
    const fallback = await pool.query('SELECT id FROM torneos ORDER BY id DESC LIMIT 1');
    return fallback.rows.length > 0 ? fallback.rows[0].id : null;
}

// ============================================================
// ESTADISTICAS OFENSIVAS
// ============================================================

// GET /api/estadisticas-ofensivas
async function obtenerOfensivas(req, res, next) {
    try {
        const { torneo_id, temporada, equipo_id, jugador_id, min_at_bats = 0 } = req.query;

        // Compatibilidad: aceptar torneo_id o temporada (legacy)
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

        const jugadoresConOPS = result.rows.map(jugador => ({
            ...jugador,
            ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3))
        }));

        res.json(jugadoresConOPS);
    } catch (error) {
        console.error('Error obteniendo estadísticas ofensivas:', error);
        next(error);
    }
}

// POST/PUT /api/estadisticas-ofensivas (upsert)
async function upsertOfensivas(req, res, next) {
    try {
        const {
            jugador_id, torneo_id, temporada,
            at_bats = 0, hits = 0, home_runs = 0, rbi = 0, runs = 0,
            walks = 0, stolen_bases = 0, strikeouts = 0, doubles = 0,
            triples = 0, caught_stealing = 0, hit_by_pitch = 0,
            sacrifice_flies = 0, sacrifice_hits = 0
        } = req.body;

        if (!jugador_id || isNaN(parseInt(jugador_id))) {
            return res.status(400).json({ error: 'ID de jugador requerido y válido' });
        }

        // Resolver torneo_id: directo, o desde torneo activo
        const torneoIdFinal = torneo_id ? parseInt(torneo_id) : await resolveTorneoId(null);

        if (!torneoIdFinal) {
            return res.status(400).json({ error: 'No se pudo determinar el torneo. Envie torneo_id o active un torneo.' });
        }

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
            parseInt(jugador_id), torneoIdFinal, parseInt(at_bats), parseInt(hits),
            parseInt(home_runs), parseInt(rbi), parseInt(runs), parseInt(walks),
            parseInt(stolen_bases), parseInt(strikeouts), parseInt(doubles),
            parseInt(triples), parseInt(caught_stealing), parseInt(hit_by_pitch),
            parseInt(sacrifice_flies), parseInt(sacrifice_hits)
        ];

        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'Estadísticas actualizadas correctamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error en upsertEstadisticasOfensivas:', error);
        next(error);
    }
}

// ============================================================
// ESTADISTICAS PITCHEO
// ============================================================

// GET /api/estadisticas-pitcheo
async function obtenerPitcheo(req, res, next) {
    try {
        const { torneo_id, equipo_id, jugador_id } = req.query;
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
            paramIndex++;
        }

        query += ' ORDER BY era ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        next(error);
    }
}

// GET /api/estadisticas-pitcheo/:id
async function obtenerPitcheoPorJugador(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const torneoIdResolved = torneo_id || await resolveTorneoId(null);

        let query = `
            SELECT ep.*, j.nombre as jugador_nombre, j.equipo_id, e.nombre as equipo_nombre
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ep.jugador_id = $1
        `;
        const params = [id];

        if (torneoIdResolved) {
            query += ' AND ep.torneo_id = $2';
            params.push(torneoIdResolved);
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas de pitcheo no encontradas' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        next(error);
    }
}

// POST /api/estadisticas-pitcheo
async function crearPitcheo(req, res, next) {
    try {
        const {
            jugador_id, torneo_id,
            innings_pitched, hits_allowed, earned_runs,
            strikeouts, walks_allowed, home_runs_allowed,
            wins, losses, saves
        } = req.body;

        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const torneoIdFinal = torneo_id ? parseInt(torneo_id) : await resolveTorneoId(null);

        if (!torneoIdFinal) {
            return res.status(400).json({ error: 'No se pudo determinar el torneo.' });
        }

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
        `, [jugador_id, torneoIdFinal, innings_pitched || 0, hits_allowed || 0,
            earned_runs || 0, strikeouts || 0, walks_allowed || 0, home_runs_allowed || 0,
            wins || 0, losses || 0, saves || 0]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando estadísticas de pitcheo:', error);
        next(error);
    }
}

// PUT /api/estadisticas-pitcheo
async function actualizarPitcheo(req, res, next) {
    try {
        const {
            jugador_id, torneo_id,
            innings_pitched, hits_allowed, earned_runs,
            strikeouts, walks_allowed, home_runs_allowed,
            wins, losses, saves
        } = req.body;

        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const torneoIdFinal = torneo_id ? parseInt(torneo_id) : await resolveTorneoId(null);

        const result = await pool.query(`
            UPDATE estadisticas_pitcheo SET
                innings_pitched = $1, hits_allowed = $2, earned_runs = $3,
                strikeouts = $4, walks_allowed = $5, home_runs_allowed = $6,
                wins = $7, losses = $8, saves = $9
            WHERE jugador_id = $10 AND torneo_id = $11
            RETURNING *
        `, [innings_pitched || 0, hits_allowed || 0, earned_runs || 0, strikeouts || 0,
            walks_allowed || 0, home_runs_allowed || 0, wins || 0, losses || 0,
            saves || 0, jugador_id, torneoIdFinal]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas de pitcheo no encontradas' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando estadísticas de pitcheo:', error);
        next(error);
    }
}

// ============================================================
// ESTADISTICAS DEFENSIVAS
// ============================================================

// GET /api/estadisticas-defensivas
async function obtenerDefensivas(req, res, next) {
    try {
        const { torneo_id, equipo_id, jugador_id } = req.query;
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
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        next(error);
    }
}

// GET /api/estadisticas-defensivas/:id
async function obtenerDefensivasPorJugador(req, res, next) {
    try {
        const { id } = req.params;
        const { torneo_id } = req.query;
        const torneoIdResolved = torneo_id || await resolveTorneoId(null);

        let query = `
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, j.equipo_id, e.nombre as equipo_nombre
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ed.jugador_id = $1
        `;
        const params = [id];

        if (torneoIdResolved) {
            query += ' AND ed.torneo_id = $2';
            params.push(torneoIdResolved);
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas defensivas no encontradas' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        next(error);
    }
}

// POST /api/estadisticas-defensivas
async function crearDefensivas(req, res, next) {
    try {
        const {
            jugador_id, torneo_id,
            putouts, assists, errors, double_plays,
            passed_balls, chances
        } = req.body;

        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const torneoIdFinal = torneo_id ? parseInt(torneo_id) : await resolveTorneoId(null);

        if (!torneoIdFinal) {
            return res.status(400).json({ error: 'No se pudo determinar el torneo.' });
        }

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
        `, [jugador_id, torneoIdFinal, putouts || 0, assists || 0,
            errors || 0, double_plays || 0, passed_balls || 0, chances || 0]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando estadísticas defensivas:', error);
        next(error);
    }
}

// PUT /api/estadisticas-defensivas
async function actualizarDefensivas(req, res, next) {
    try {
        const {
            jugador_id, torneo_id,
            putouts, assists, errors, double_plays,
            passed_balls, chances
        } = req.body;

        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const torneoIdFinal = torneo_id ? parseInt(torneo_id) : await resolveTorneoId(null);

        const result = await pool.query(`
            UPDATE estadisticas_defensivas SET
                putouts = $1, assists = $2, errors = $3, double_plays = $4,
                passed_balls = $5, chances = $6
            WHERE jugador_id = $7 AND torneo_id = $8
            RETURNING *
        `, [putouts || 0, assists || 0, errors || 0, double_plays || 0,
            passed_balls || 0, chances || 0, jugador_id, torneoIdFinal]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas defensivas no encontradas' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando estadísticas defensivas:', error);
        next(error);
    }
}

module.exports = {
    resolveTorneoId,
    obtenerOfensivas,
    upsertOfensivas,
    obtenerPitcheo,
    obtenerPitcheoPorJugador,
    crearPitcheo,
    actualizarPitcheo,
    obtenerDefensivas,
    obtenerDefensivasPorJugador,
    crearDefensivas,
    actualizarDefensivas
};

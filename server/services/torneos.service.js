/**
 * Service de Torneos
 * Lógica de negocio para gestión completa de torneos
 * con aislamiento de estadísticas por torneo
 */
const pool = require('../config/database');
const { hasColumn } = require('../utils/schema');
const { DEFAULT_TOTAL_GAMES, DEFAULT_PLAYOFF_SLOTS } = require('../utils/playoffFormat');

// ============================================================
// RESOLVER TORNEO
// ============================================================

/**
 * Resolver torneo_id: busca el torneo activo o fallback al más reciente
 * Reemplaza resolveTemporada() del server.js original
 * @param {number|string|null} torneo_id - ID de torneo explícito (opcional)
 * @returns {number|null} - ID del torneo resuelto
 */
async function resolveTorneoId(torneo_id) {
    // Si se provee un ID válido, usarlo directamente
    if (torneo_id && !isNaN(parseInt(torneo_id))) {
        return parseInt(torneo_id);
    }

    // Buscar el torneo activo
    const result = await pool.query(`
        SELECT id
        FROM torneos
        WHERE activo = true
        ORDER BY fecha_inicio DESC NULLS LAST, id DESC
        LIMIT 1
    `);
    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    const currentPublic = await pool.query(`
        SELECT id
        FROM torneos
        WHERE COALESCE(visible_publico, true) = true
          AND COALESCE(estado, 'activo') = 'activo'
        ORDER BY fecha_inicio DESC NULLS LAST, id DESC
        LIMIT 1
    `);
    if (currentPublic.rows.length > 0) {
        return currentPublic.rows[0].id;
    }

    // Fallback: el torneo más reciente
    const fallback = await pool.query(
        'SELECT id FROM torneos ORDER BY id DESC LIMIT 1'
    );
    return fallback.rows.length > 0 ? fallback.rows[0].id : null;
}

// ============================================================
// CRUD DE TORNEOS
// ============================================================

/**
 * Obtener torneo activo con datos completos
 * @returns {object|null}
 */
async function obtenerTorneoActivo() {
    const result = await pool.query(`
        SELECT *
        FROM torneos
        WHERE activo = true
        ORDER BY fecha_inicio DESC NULLS LAST, id DESC
        LIMIT 1
    `);
    if (result.rows[0]) return result.rows[0];

    const fallback = await pool.query(`
        SELECT *
        FROM torneos
        WHERE COALESCE(visible_publico, true) = true
          AND COALESCE(estado, 'activo') = 'activo'
        ORDER BY fecha_inicio DESC NULLS LAST, id DESC
        LIMIT 1
    `);
    return fallback.rows[0] || null;
}

/**
 * Obtiene todos los torneos ordenados por fecha
 * @returns {Array}
 */
async function obtenerTodos(options = {}) {
    const {
        publicOnly = false
    } = options;

    const hasEstado = await hasColumn('torneos', 'estado');
    const hasVisiblePublico = await hasColumn('torneos', 'visible_publico');

    const where = [];
    const params = [];

    if (publicOnly) {
        if (hasVisiblePublico) {
            where.push('visible_publico = true');
        }
        if (hasEstado) {
            where.push(`COALESCE(estado, 'activo') <> 'archivado'`);
        }
    }

    const query = `
        SELECT *
        FROM torneos
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY activo DESC, fecha_inicio DESC, id DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Obtiene un torneo por ID
 * @param {number} torneoId
 * @returns {object|null}
 */
async function obtenerPorId(torneoId) {
    const result = await pool.query(
        'SELECT * FROM torneos WHERE id = $1',
        [torneoId]
    );
    return result.rows[0] || null;
}

function normalizarCriteriosElegibilidad(torneo = {}) {
    return {
        min_ab_rate_stats: torneo.min_ab_rate_stats === null || torneo.min_ab_rate_stats === undefined ? null : Number(torneo.min_ab_rate_stats),
        min_ab_counting_stats: torneo.min_ab_counting_stats === null || torneo.min_ab_counting_stats === undefined ? null : Number(torneo.min_ab_counting_stats),
        min_ab_mvp: torneo.min_ab_mvp === null || torneo.min_ab_mvp === undefined ? null : Number(torneo.min_ab_mvp),
        min_ip_rate_stats: torneo.min_ip_rate_stats === null || torneo.min_ip_rate_stats === undefined ? null : Number(torneo.min_ip_rate_stats),
        min_ip_counting_stats: torneo.min_ip_counting_stats === null || torneo.min_ip_counting_stats === undefined ? null : Number(torneo.min_ip_counting_stats),
        min_ip_pitcher_award: torneo.min_ip_pitcher_award === null || torneo.min_ip_pitcher_award === undefined ? null : Number(torneo.min_ip_pitcher_award),
        min_chances_defense: torneo.min_chances_defense === null || torneo.min_chances_defense === undefined ? null : Number(torneo.min_chances_defense)
    };
}

async function obtenerCriteriosElegibilidad(torneoId) {
    const torneo = await obtenerPorId(torneoId);
    return normalizarCriteriosElegibilidad(torneo || {});
}

/**
 * Crea un nuevo torneo
 * @param {string} nombre
 * @param {object} opciones - { fecha_inicio, total_juegos, cupos_playoffs }
 * @returns {object} - Torneo creado
 */
async function crear(nombre, opciones = {}) {
    const {
        fecha_inicio = new Date(),
        total_juegos = DEFAULT_TOTAL_GAMES,
        cupos_playoffs = DEFAULT_PLAYOFF_SLOTS,
        min_ab_rate_stats = null,
        min_ab_counting_stats = null,
        min_ab_mvp = null,
        min_ip_rate_stats = null,
        min_ip_counting_stats = null,
        min_ip_pitcher_award = null,
        min_chances_defense = null
    } = opciones;

    const result = await pool.query(
        `INSERT INTO torneos (
            nombre, fecha_inicio, activo, total_juegos, cupos_playoffs,
            min_ab_rate_stats, min_ab_counting_stats, min_ab_mvp,
            min_ip_rate_stats, min_ip_counting_stats, min_ip_pitcher_award,
            min_chances_defense
         )
         VALUES ($1, $2, false, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
            nombre,
            fecha_inicio,
            total_juegos,
            cupos_playoffs,
            min_ab_rate_stats,
            min_ab_counting_stats,
            min_ab_mvp,
            min_ip_rate_stats,
            min_ip_counting_stats,
            min_ip_pitcher_award,
            min_chances_defense
        ]
    );
    return result.rows[0];
}

// ============================================================
// ACTIVACIÓN CON INICIALIZACIÓN DE ESTADÍSTICAS
// ============================================================

/**
 * Activa un torneo (desactiva todos los demás) e inicializa
 * estadísticas en 0 para todos los jugadores con equipo
 * @param {number} torneoId
 * @returns {object} - Torneo activado
 */
async function activarTorneo(torneoId) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Desactivar todos
        await client.query('UPDATE torneos SET activo = false');

        // Activar el seleccionado
        const result = await client.query(
            'UPDATE torneos SET activo = true WHERE id = $1 RETURNING *',
            [torneoId]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        // Inicializar estadísticas para todos los jugadores con equipo
        await inicializarEstadisticas(client, torneoId);

        await client.query('COMMIT');
        return result.rows[0];

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Inicializa estadísticas en 0 para todos los jugadores con equipo asignado.
 * Usa ON CONFLICT DO NOTHING para no sobreescribir stats existentes.
 * Nota: jugadores no tiene columna 'activo', usamos equipo_id IS NOT NULL
 * @param {object} client - PostgreSQL client (dentro de transacción)
 * @param {number} torneoId
 */
async function inicializarEstadisticas(client, torneoId) {
    // Obtener todos los jugadores que tienen equipo (considerados "activos")
    const jugadores = await client.query(
        'SELECT id FROM jugadores WHERE equipo_id IS NOT NULL'
    );

    if (jugadores.rows.length === 0) {
        return;
    }

    for (const jugador of jugadores.rows) {
        const jugadorId = jugador.id;

        // Insertar stats ofensivas en 0 (si no existen)
        await client.query(
            `INSERT INTO estadisticas_ofensivas (
                jugador_id, torneo_id, at_bats, hits, doubles, triples,
                home_runs, rbi, runs, walks, strikeouts, stolen_bases,
                caught_stealing, hit_by_pitch, sacrifice_flies, sacrifice_hits
            ) VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
            ON CONFLICT (jugador_id, torneo_id) DO NOTHING`,
            [jugadorId, torneoId]
        );

        // Insertar stats pitcheo en 0 (si no existen)
        await client.query(
            `INSERT INTO estadisticas_pitcheo (
                jugador_id, torneo_id, innings_pitched, hits_allowed,
                earned_runs, strikeouts, walks_allowed, home_runs_allowed,
                wins, losses, saves
            ) VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, 0, 0)
            ON CONFLICT (jugador_id, torneo_id) DO NOTHING`,
            [jugadorId, torneoId]
        );

        // Insertar stats defensivas en 0 (si no existen)
        await client.query(
            `INSERT INTO estadisticas_defensivas (
                jugador_id, torneo_id, putouts, assists, errors,
                double_plays, passed_balls, chances
            ) VALUES ($1, $2, 0, 0, 0, 0, 0, 0)
            ON CONFLICT (jugador_id, torneo_id) DO NOTHING`,
            [jugadorId, torneoId]
        );
    }
}

// ============================================================
// ELIMINACIÓN
// ============================================================

/**
 * Elimina un torneo (solo si NO está activo)
 * Las estadísticas se eliminan automáticamente por ON DELETE CASCADE
 * @param {number} torneoId
 */
async function eliminar(torneoId) {
    const torneo = await obtenerPorId(torneoId);

    if (!torneo) {
        throw new Error(`Torneo ${torneoId} no encontrado`);
    }

    if (torneo.activo) {
        throw new Error('No se puede eliminar el torneo activo');
    }

    await pool.query('DELETE FROM torneos WHERE id = $1', [torneoId]);
}

// ============================================================
// ESTADÍSTICAS POR TORNEO
// ============================================================

/**
 * Cuenta estadísticas asociadas a un torneo (desglosado por tipo)
 * @param {number} torneoId
 * @returns {object} - { ofensivas, pitcheo, defensivas, total }
 */
async function contarEstadisticas(torneoId) {
    const result = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM estadisticas_ofensivas WHERE torneo_id = $1)::int as ofensivas,
            (SELECT COUNT(*) FROM estadisticas_pitcheo WHERE torneo_id = $1)::int as pitcheo,
            (SELECT COUNT(*) FROM estadisticas_defensivas WHERE torneo_id = $1)::int as defensivas
        `,
        [torneoId]
    );

    const row = result.rows[0];
    return {
        ofensivas: row.ofensivas,
        pitcheo: row.pitcheo,
        defensivas: row.defensivas,
        total: row.ofensivas + row.pitcheo + row.defensivas
    };
}

/**
 * Verifica si un torneo tiene estadísticas (mantener compatibilidad)
 * @param {number} torneoId
 * @returns {number}
 */
async function contarEstadisticasAsociadas(torneoId) {
    const stats = await contarEstadisticas(torneoId);
    return stats.total;
}

module.exports = {
    resolveTorneoId,
    obtenerTorneoActivo,
    obtenerTodos,
    obtenerPorId,
    obtenerCriteriosElegibilidad,
    normalizarCriteriosElegibilidad,
    crear,
    activarTorneo,
    inicializarEstadisticas,
    eliminar,
    contarEstadisticas,
    contarEstadisticasAsociadas
};

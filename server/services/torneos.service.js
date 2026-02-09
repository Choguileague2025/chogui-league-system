/**
 * Service de Torneos
 * Lógica de negocio para gestión de torneos
 */
const pool = require('../config/database');

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
    const result = await pool.query(
        'SELECT id FROM torneos WHERE activo = true LIMIT 1'
    );
    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    // Fallback: el torneo más reciente
    const fallback = await pool.query(
        'SELECT id FROM torneos ORDER BY id DESC LIMIT 1'
    );
    return fallback.rows.length > 0 ? fallback.rows[0].id : null;
}

/**
 * Obtener torneo activo con datos completos
 * @returns {object|null}
 */
async function obtenerTorneoActivo() {
    const result = await pool.query(
        'SELECT * FROM torneos WHERE activo = true LIMIT 1'
    );
    return result.rows[0] || null;
}

/**
 * Activar un torneo (desactiva todos los demás en transacción)
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
 * Verificar si un torneo tiene estadísticas asociadas
 * @param {number} torneoId
 * @returns {number} - Cantidad de registros asociados
 */
async function contarEstadisticasAsociadas(torneoId) {
    const result = await pool.query(`
        SELECT COUNT(*) as count FROM (
            SELECT 1 FROM estadisticas_ofensivas WHERE torneo_id = $1
            UNION ALL
            SELECT 1 FROM estadisticas_pitcheo WHERE torneo_id = $1
            UNION ALL
            SELECT 1 FROM estadisticas_defensivas WHERE torneo_id = $1
        ) as stats
    `, [torneoId]);

    return parseInt(result.rows[0].count);
}

module.exports = {
    resolveTorneoId,
    obtenerTorneoActivo,
    activarTorneo,
    contarEstadisticasAsociadas
};

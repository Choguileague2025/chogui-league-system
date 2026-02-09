const pool = require('../config/database');
const path = require('path');
const fs = require('fs');
const { validarCrearEquipo, validarActualizarEquipo } = require('../validators/equipos.validator');

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
    obtenerLogo,
    crear,
    actualizar,
    eliminar
};

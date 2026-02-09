const pool = require('../config/database');
const { validarCrearTorneo, validarActualizarTorneo } = require('../validators/torneos.validator');
const torneosService = require('../services/torneos.service');

// GET /api/torneos
async function obtenerTodos(req, res, next) {
    try {
        const result = await pool.query('SELECT * FROM torneos ORDER BY fecha_inicio DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo torneos:', error);
        next(error);
    }
}

// GET /api/torneos/activo
async function obtenerActivo(req, res, next) {
    try {
        const torneo = await torneosService.obtenerTorneoActivo();
        if (!torneo) {
            return res.status(404).json({ message: 'No hay torneo activo' });
        }
        res.json(torneo);
    } catch (error) {
        console.error('Error obteniendo torneo activo:', error);
        next(error);
    }
}

// POST /api/torneos
async function crear(req, res, next) {
    try {
        const validation = validarCrearTorneo(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { nombre, total_juegos, cupos_playoffs } = validation.sanitized;

        const result = await pool.query(
            'INSERT INTO torneos (nombre, total_juegos, cupos_playoffs) VALUES ($1, $2, $3) RETURNING *',
            [nombre, total_juegos, cupos_playoffs]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un torneo con ese nombre' });
        }
        console.error('Error creando torneo:', error);
        next(error);
    }
}

// PUT /api/torneos/:id/activar
async function activar(req, res, next) {
    try {
        const { id } = req.params;
        const torneo = await torneosService.activarTorneo(id);

        if (!torneo) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        res.json(torneo);
    } catch (error) {
        console.error('Error activando torneo:', error);
        next(error);
    }
}

// PUT /api/torneos/desactivar-todos
async function desactivarTodos(req, res, next) {
    try {
        await pool.query('UPDATE torneos SET activo = false');
        res.json({ message: 'Todos los torneos desactivados' });
    } catch (error) {
        console.error('Error desactivando torneos:', error);
        next(error);
    }
}

// PUT /api/torneos/:id
async function actualizar(req, res, next) {
    try {
        const { id } = req.params;
        const validation = validarActualizarTorneo(req.body);

        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const { fields, values } = validation;

        // Construir query dinámico
        const setClauses = fields.map((field, idx) => `${field} = $${idx + 1}`);
        const query = `UPDATE torneos SET ${setClauses.join(', ')} WHERE id = $${fields.length + 1} RETURNING *`;
        values.push(id);

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un torneo con ese nombre' });
        }
        console.error('Error actualizando torneo:', error);
        next(error);
    }
}

// DELETE /api/torneos/:id
// MIGRADO: Antes usaba "temporada IN (SELECT nombre...)", ahora usa torneo_id directamente
async function eliminar(req, res, next) {
    try {
        const { id } = req.params;

        // Verificar estadísticas asociadas usando el service
        const statsCount = await torneosService.contarEstadisticasAsociadas(id);

        if (statsCount > 0) {
            return res.status(400).json({
                error: 'No se puede eliminar el torneo porque tiene estadísticas asociadas'
            });
        }

        const result = await pool.query('DELETE FROM torneos WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        res.json({ message: 'Torneo eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando torneo:', error);
        next(error);
    }
}

module.exports = {
    obtenerTodos,
    obtenerActivo,
    crear,
    activar,
    desactivarTodos,
    actualizar,
    eliminar
};

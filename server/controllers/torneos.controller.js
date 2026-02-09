const pool = require('../config/database');
const { validarCrearTorneo, validarActualizarTorneo } = require('../validators/torneos.validator');
const torneosService = require('../services/torneos.service');

// GET /api/torneos
async function obtenerTodos(req, res, next) {
    try {
        const torneos = await torneosService.obtenerTodos();
        res.json(torneos);
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

// GET /api/torneos/:id
async function obtenerPorId(req, res, next) {
    try {
        const { id } = req.params;
        const torneo = await torneosService.obtenerPorId(parseInt(id));

        if (!torneo) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        res.json(torneo);
    } catch (error) {
        console.error('Error obteniendo torneo:', error);
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

        const torneo = await torneosService.crear(nombre, {
            fecha_inicio: req.body.fecha_inicio || new Date(),
            total_juegos,
            cupos_playoffs
        });

        res.status(201).json(torneo);
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
        const torneo = await torneosService.activarTorneo(parseInt(id));

        if (!torneo) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        res.json({
            success: true,
            message: `Torneo "${torneo.nombre}" activado. Estadísticas inicializadas.`,
            torneo
        });
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
async function eliminar(req, res, next) {
    try {
        const { id } = req.params;
        await torneosService.eliminar(parseInt(id));
        res.json({ success: true, message: 'Torneo eliminado correctamente' });
    } catch (error) {
        if (error.message.includes('no encontrado')) {
            return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('No se puede eliminar')) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error eliminando torneo:', error);
        next(error);
    }
}

// GET /api/torneos/:id/estadisticas
async function obtenerEstadisticas(req, res, next) {
    try {
        const { id } = req.params;
        const torneo = await torneosService.obtenerPorId(parseInt(id));

        if (!torneo) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        const stats = await torneosService.contarEstadisticas(parseInt(id));
        res.json({
            torneo: {
                id: torneo.id,
                nombre: torneo.nombre,
                activo: torneo.activo
            },
            estadisticas: stats
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas del torneo:', error);
        next(error);
    }
}

module.exports = {
    obtenerTodos,
    obtenerActivo,
    obtenerPorId,
    crear,
    activar,
    desactivarTodos,
    actualizar,
    eliminar,
    obtenerEstadisticas
};

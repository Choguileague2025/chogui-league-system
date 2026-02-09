const pool = require('../config/database');

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
        const result = await pool.query('SELECT * FROM torneos WHERE activo = true LIMIT 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No hay torneo activo' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo torneo activo:', error);
        next(error);
    }
}

// POST /api/torneos
async function crear(req, res, next) {
    try {
        const { nombre, total_juegos, cupos_playoffs } = req.body;

        if (!nombre || nombre.trim().length < 3) {
            return res.status(400).json({
                error: 'El nombre del torneo debe tener al menos 3 caracteres'
            });
        }

        const totalJuegosFinal = total_juegos ? parseInt(total_juegos, 10) : 22;
        const cuposPlayoffsFinal = cupos_playoffs ? parseInt(cupos_playoffs, 10) : 6;

        if (isNaN(totalJuegosFinal) || totalJuegosFinal <= 0) {
            return res.status(400).json({ error: 'El total de juegos debe ser un número positivo.' });
        }
        if (isNaN(cuposPlayoffsFinal) || cuposPlayoffsFinal <= 0) {
            return res.status(400).json({ error: 'Los cupos de playoffs deben ser un número positivo.' });
        }

        const result = await pool.query(
            'INSERT INTO torneos (nombre, total_juegos, cupos_playoffs) VALUES ($1, $2, $3) RETURNING *',
            [nombre.trim(), totalJuegosFinal, cuposPlayoffsFinal]
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
        await pool.query('UPDATE torneos SET activo = false');
        const result = await pool.query(
            'UPDATE torneos SET activo = true WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }
        res.json(result.rows[0]);
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
        const { nombre, total_juegos, cupos_playoffs } = req.body;

        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (nombre) {
            if (nombre.trim().length < 3) {
                return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres.' });
            }
            fields.push(`nombre = $${paramIndex++}`);
            values.push(nombre.trim());
        }
        if (total_juegos) {
            const totalJuegosNum = parseInt(total_juegos, 10);
            if (isNaN(totalJuegosNum) || totalJuegosNum <= 0) {
                return res.status(400).json({ error: 'Total de juegos debe ser un número positivo.' });
            }
            fields.push(`total_juegos = $${paramIndex++}`);
            values.push(totalJuegosNum);
        }
        if (cupos_playoffs) {
            const cuposPlayoffsNum = parseInt(cupos_playoffs, 10);
            if (isNaN(cuposPlayoffsNum) || cuposPlayoffsNum <= 0) {
                return res.status(400).json({ error: 'Cupos de playoffs debe ser un número positivo.' });
            }
            fields.push(`cupos_playoffs = $${paramIndex++}`);
            values.push(cuposPlayoffsNum);
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No se proporcionaron campos para actualizar.' });
        }

        const query = `UPDATE torneos SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
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

        // Verificar si hay estadisticas asociadas via torneo_id (FK)
        const statsCheck = await pool.query(`
            SELECT COUNT(*) as count FROM (
                SELECT 1 FROM estadisticas_ofensivas WHERE torneo_id = $1
                UNION ALL
                SELECT 1 FROM estadisticas_pitcheo WHERE torneo_id = $1
                UNION ALL
                SELECT 1 FROM estadisticas_defensivas WHERE torneo_id = $1
            ) as stats
        `, [id]);

        if (parseInt(statsCheck.rows[0].count) > 0) {
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

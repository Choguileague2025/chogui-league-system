const pool = require('../config/database');
const { hasTable, hasColumn } = require('../utils/schema');

function toNullableInt(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

async function ensureSchema(res) {
    const ligasExists = await hasTable('ligas');
    const divisionesExists = await hasTable('divisiones');
    if (!ligasExists || !divisionesExists) {
        res.status(400).json({
            error: 'El esquema multi-liga aun no esta disponible. Ejecute la migracion 005_multi_liga.sql.'
        });
        return false;
    }
    return true;
}

async function obtenerLigas(req, res, next) {
    try {
        if (!await ensureSchema(res)) return;

        const includeDivisions = req.query.include_divisions === 'true';
        const ligas = await pool.query('SELECT * FROM ligas ORDER BY activa DESC, nombre ASC');

        if (!includeDivisions) {
            return res.json(ligas.rows);
        }

        const divisiones = await pool.query(`
            SELECT d.*, l.nombre AS liga_nombre
            FROM divisiones d
            JOIN ligas l ON l.id = d.liga_id
            ORDER BY l.nombre ASC, d.nombre ASC
        `);

        const byLiga = new Map();
        divisiones.rows.forEach(row => {
            if (!byLiga.has(row.liga_id)) byLiga.set(row.liga_id, []);
            byLiga.get(row.liga_id).push(row);
        });

        res.json(ligas.rows.map(liga => ({
            ...liga,
            divisiones: byLiga.get(liga.id) || []
        })));
    } catch (error) {
        console.error('Error obteniendo ligas:', error);
        next(error);
    }
}

async function crearLiga(req, res, next) {
    try {
        if (!await ensureSchema(res)) return;

        const nombre = String(req.body.nombre || '').trim();
        const descripcion = String(req.body.descripcion || '').trim() || null;
        const activa = req.body.activa === undefined ? true : Boolean(req.body.activa);

        if (nombre.length < 3) {
            return res.status(400).json({ error: 'El nombre de la liga debe tener al menos 3 caracteres' });
        }

        const result = await pool.query(
            'INSERT INTO ligas (nombre, descripcion, activa) VALUES ($1, $2, $3) RETURNING *',
            [nombre, descripcion, activa]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una liga con ese nombre' });
        }
        console.error('Error creando liga:', error);
        next(error);
    }
}

async function actualizarLiga(req, res, next) {
    try {
        if (!await ensureSchema(res)) return;
        const { id } = req.params;
        const fields = [];
        const values = [];

        if (req.body.nombre !== undefined) {
            const nombre = String(req.body.nombre || '').trim();
            if (nombre.length < 3) {
                return res.status(400).json({ error: 'El nombre de la liga debe tener al menos 3 caracteres' });
            }
            fields.push(`nombre = $${fields.length + 1}`);
            values.push(nombre);
        }

        if (req.body.descripcion !== undefined) {
            fields.push(`descripcion = $${fields.length + 1}`);
            values.push(String(req.body.descripcion || '').trim() || null);
        }

        if (req.body.activa !== undefined) {
            fields.push(`activa = $${fields.length + 1}`);
            values.push(Boolean(req.body.activa));
        }

        if (!fields.length) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        values.push(id);
        const result = await pool.query(
            `UPDATE ligas SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
            values
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: 'Liga no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una liga con ese nombre' });
        }
        console.error('Error actualizando liga:', error);
        next(error);
    }
}

async function eliminarLiga(req, res, next) {
    try {
        if (!await ensureSchema(res)) return;
        const result = await pool.query('DELETE FROM ligas WHERE id = $1 RETURNING *', [req.params.id]);
        if (!result.rows.length) {
            return res.status(404).json({ error: 'Liga no encontrada' });
        }
        res.json({ success: true, deleted: result.rows[0] });
    } catch (error) {
        console.error('Error eliminando liga:', error);
        next(error);
    }
}

async function obtenerDivisiones(req, res, next) {
    try {
        if (!await ensureSchema(res)) return;

        const ligaId = toNullableInt(req.query.liga_id || req.params.ligaId);
        const params = [];
        let query = `
            SELECT d.*, l.nombre AS liga_nombre
            FROM divisiones d
            JOIN ligas l ON l.id = d.liga_id
            WHERE 1=1
        `;

        if (ligaId) {
            params.push(ligaId);
            query += ` AND d.liga_id = $${params.length}`;
        }

        query += ' ORDER BY l.nombre ASC, d.nombre ASC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo divisiones:', error);
        next(error);
    }
}

async function crearDivision(req, res, next) {
    try {
        if (!await ensureSchema(res)) return;

        const ligaId = toNullableInt(req.body.liga_id);
        const nombre = String(req.body.nombre || '').trim();
        const descripcion = String(req.body.descripcion || '').trim() || null;

        if (!ligaId) {
            return res.status(400).json({ error: 'liga_id es obligatorio' });
        }
        if (nombre.length < 2) {
            return res.status(400).json({ error: 'El nombre de la division debe tener al menos 2 caracteres' });
        }

        const result = await pool.query(
            'INSERT INTO divisiones (liga_id, nombre, descripcion) VALUES ($1, $2, $3) RETURNING *',
            [ligaId, nombre, descripcion]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una division con ese nombre en la liga' });
        }
        console.error('Error creando division:', error);
        next(error);
    }
}

async function actualizarDivision(req, res, next) {
    try {
        if (!await ensureSchema(res)) return;
        const { id } = req.params;
        const fields = [];
        const values = [];

        if (req.body.liga_id !== undefined) {
            fields.push(`liga_id = $${fields.length + 1}`);
            values.push(toNullableInt(req.body.liga_id));
        }
        if (req.body.nombre !== undefined) {
            const nombre = String(req.body.nombre || '').trim();
            if (nombre.length < 2) {
                return res.status(400).json({ error: 'El nombre de la division debe tener al menos 2 caracteres' });
            }
            fields.push(`nombre = $${fields.length + 1}`);
            values.push(nombre);
        }
        if (req.body.descripcion !== undefined) {
            fields.push(`descripcion = $${fields.length + 1}`);
            values.push(String(req.body.descripcion || '').trim() || null);
        }

        if (!fields.length) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        values.push(id);
        const result = await pool.query(
            `UPDATE divisiones SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
            values
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: 'Division no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una division con ese nombre en la liga' });
        }
        console.error('Error actualizando division:', error);
        next(error);
    }
}

async function eliminarDivision(req, res, next) {
    try {
        if (!await ensureSchema(res)) return;
        const result = await pool.query('DELETE FROM divisiones WHERE id = $1 RETURNING *', [req.params.id]);
        if (!result.rows.length) {
            return res.status(404).json({ error: 'Division no encontrada' });
        }
        res.json({ success: true, deleted: result.rows[0] });
    } catch (error) {
        console.error('Error eliminando division:', error);
        next(error);
    }
}

async function asignarEntidad(req, res, next) {
    try {
        if (!await ensureSchema(res)) return;
        const { tipo, id } = req.params;
        const tabla = tipo === 'equipos' ? 'equipos' : tipo === 'torneos' ? 'torneos' : null;

        if (!tabla) {
            return res.status(400).json({ error: 'tipo invalido. Use "equipos" o "torneos"' });
        }

        const hasLiga = await hasColumn(tabla, 'liga_id');
        const hasDivision = await hasColumn(tabla, 'division_id');
        if (!hasLiga || !hasDivision) {
            return res.status(400).json({ error: `La tabla ${tabla} aun no soporta liga/division` });
        }

        const ligaId = toNullableInt(req.body.liga_id);
        const divisionId = toNullableInt(req.body.division_id);
        const result = await pool.query(
            `UPDATE ${tabla} SET liga_id = $1, division_id = $2 WHERE id = $3 RETURNING *`,
            [ligaId, divisionId, id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: `${tipo.slice(0, -1)} no encontrado` });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error asignando liga/division:', error);
        next(error);
    }
}

module.exports = {
    obtenerLigas,
    crearLiga,
    actualizarLiga,
    eliminarLiga,
    obtenerDivisiones,
    crearDivision,
    actualizarDivision,
    eliminarDivision,
    asignarEntidad
};

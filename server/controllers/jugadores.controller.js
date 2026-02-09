const pool = require('../config/database');

// GET /api/jugadores
async function obtenerTodos(req, res, next) {
    try {
        const { page = 1, limit = 50, equipo_id, posicion, search } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT j.*, e.nombre as equipo_nombre
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (equipo_id) {
            query += ` AND j.equipo_id = $${paramIndex}`;
            params.push(equipo_id);
            paramIndex++;
        }
        if (posicion) {
            query += ` AND j.posicion = $${paramIndex}`;
            params.push(posicion);
            paramIndex++;
        }
        if (search) {
            query += ` AND j.nombre ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY j.nombre ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Contar total para paginacion
        let countQuery = 'SELECT COUNT(*) FROM jugadores j WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (equipo_id) {
            countQuery += ` AND j.equipo_id = $${countParamIndex}`;
            countParams.push(equipo_id);
            countParamIndex++;
        }
        if (posicion) {
            countQuery += ` AND j.posicion = $${countParamIndex}`;
            countParams.push(posicion);
            countParamIndex++;
        }
        if (search) {
            countQuery += ` AND j.nombre ILIKE $${countParamIndex}`;
            countParams.push(`%${search}%`);
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            jugadores: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error obteniendo jugadores:', error);
        next(error);
    }
}

// GET /api/jugadores/buscar
async function buscar(req, res, next) {
    try {
        const { query } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'La búsqueda debe tener al menos 2 caracteres',
                jugadores: [],
                equipos: [],
                total: 0
            });
        }

        const searchTerm = `%${query.trim()}%`;

        const jugadoresResult = await pool.query(`
            SELECT
                j.id, j.nombre, j.numero, j.posicion,
                e.id as equipo_id, e.nombre as equipo_nombre,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                CASE
                    WHEN COALESCE(eo.at_bats, 0) > 0
                    THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / eo.at_bats, 3)
                    ELSE 0.000
                END as promedio_bateo,
                'jugador' as tipo_resultado
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE LOWER(j.nombre) LIKE LOWER($1)
            ORDER BY j.nombre ASC
            LIMIT 15
        `, [searchTerm]);

        const equiposResult = await pool.query(`
            SELECT
                e.id, e.nombre, e.ciudad, e.manager,
                COUNT(j.id) as total_jugadores,
                'equipo' as tipo_resultado
            FROM equipos e
            LEFT JOIN jugadores j ON e.id = j.equipo_id
            WHERE LOWER(e.nombre) LIKE LOWER($1)
               OR LOWER(e.ciudad) LIKE LOWER($1)
            GROUP BY e.id, e.nombre, e.ciudad, e.manager
            ORDER BY e.nombre ASC
            LIMIT 10
        `, [searchTerm]);

        const totalResultados = jugadoresResult.rows.length + equiposResult.rows.length;

        res.json({
            jugadores: jugadoresResult.rows,
            equipos: equiposResult.rows,
            total: totalResultados,
            query: query.trim()
        });
    } catch (error) {
        console.error('Error buscando:', error);
        next(error);
    }
}

// GET /api/jugadores/:id
async function obtenerPorId(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT
                j.id, j.nombre, j.posicion, j.numero, j.equipo_id,
                e.nombre as equipo_nombre,
                e.manager as equipo_manager,
                e.ciudad as equipo_ciudad,
                COALESCE(s.strikeouts, 0) as strikeouts,
                COALESCE(s.at_bats, 0) as at_bats,
                COALESCE(s.hits, 0) as hits
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas s ON j.id = s.jugador_id
            WHERE j.id = $1
            LIMIT 1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo jugador:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/partidos
async function obtenerPartidos(req, res, next) {
    try {
        const { id } = req.params;

        const jugadorQuery = await pool.query(
            'SELECT equipo_id FROM jugadores WHERE id = $1',
            [id]
        );

        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        const equipoId = jugadorQuery.rows[0].equipo_id;

        if (!equipoId) {
            return res.json([]);
        }

        const partidosQuery = await pool.query(`
            SELECT
                p.id, p.fecha_partido, p.carreras_local, p.carreras_visitante,
                p.equipo_local_id, p.equipo_visitante_id,
                el.nombre as equipo_local_nombre,
                ev.nombre as equipo_visitante_nombre
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE (p.equipo_local_id = $1 OR p.equipo_visitante_id = $1)
                AND p.estado = 'finalizado'
            ORDER BY p.fecha_partido DESC
            LIMIT 10
        `, [equipoId]);

        res.json(partidosQuery.rows);
    } catch (error) {
        console.error('Error obteniendo partidos del jugador:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/similares
async function obtenerSimilares(req, res, next) {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 5;

        const jugadorQuery = await pool.query(
            'SELECT posicion, equipo_id FROM jugadores WHERE id = $1',
            [id]
        );

        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        const { posicion } = jugadorQuery.rows[0];

        if (!posicion) {
            return res.json([]);
        }

        const similaresQuery = await pool.query(`
            SELECT
                j.id, j.nombre, j.numero, j.posicion,
                e.nombre as equipo_nombre,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                CASE
                    WHEN COALESCE(eo.at_bats, 0) > 0
                    THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / COALESCE(eo.at_bats, 1), 3)
                    ELSE 0.000
                END as avg
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE j.posicion = $1
                AND j.id != $2
                AND j.equipo_id IS NOT NULL
            ORDER BY avg DESC, eo.hits DESC
            LIMIT $3
        `, [posicion, id, limit]);

        res.json(similaresQuery.rows);
    } catch (error) {
        console.error('Error obteniendo jugadores similares:', error);
        next(error);
    }
}

// GET /api/jugadores/:id/companeros
async function obtenerCompaneros(req, res, next) {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 5;

        const jugadorQuery = await pool.query(
            'SELECT equipo_id FROM jugadores WHERE id = $1',
            [id]
        );

        if (jugadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        const { equipo_id } = jugadorQuery.rows[0];

        if (!equipo_id) {
            return res.json([]);
        }

        const companerosQuery = await pool.query(`
            SELECT
                j.id, j.nombre, j.numero, j.posicion,
                e.nombre as equipo_nombre,
                COALESCE(eo.at_bats, 0) as at_bats,
                COALESCE(eo.hits, 0) as hits,
                COALESCE(eo.home_runs, 0) as home_runs,
                COALESCE(eo.rbi, 0) as rbi,
                CASE
                    WHEN COALESCE(eo.at_bats, 0) > 0
                    THEN ROUND(COALESCE(eo.hits, 0)::DECIMAL / COALESCE(eo.at_bats, 1), 3)
                    ELSE 0.000
                END as avg
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            LEFT JOIN estadisticas_ofensivas eo ON j.id = eo.jugador_id
            WHERE j.equipo_id = $1
                AND j.id != $2
            ORDER BY avg DESC, eo.hits DESC
            LIMIT $3
        `, [equipo_id, id, limit]);

        res.json(companerosQuery.rows);
    } catch (error) {
        console.error('Error obteniendo compañeros de equipo:', error);
        next(error);
    }
}

// POST /api/jugadores
async function crear(req, res, next) {
    try {
        const { nombre, equipo_id, posicion, numero } = req.body;

        if (!nombre || nombre.trim().length < 2 || nombre.trim().length > 100) {
            return res.status(400).json({ error: 'El nombre debe tener entre 2 y 100 caracteres' });
        }

        let equipoIdFinal = null;
        if (equipo_id !== undefined && equipo_id !== null && `${equipo_id}` !== '') {
            equipoIdFinal = parseInt(equipo_id, 10);
            if (Number.isNaN(equipoIdFinal)) {
                return res.status(400).json({ error: 'Equipo inválido' });
            }
            const eq = await pool.query('SELECT id FROM equipos WHERE id = $1', [equipoIdFinal]);
            if (eq.rows.length === 0) {
                return res.status(400).json({ error: 'El equipo seleccionado no existe' });
            }
        }

        const posicionesValidas = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P', 'UTIL', 'DH'];
        let posicionFinal = null;
        if (posicion !== undefined && posicion !== null && `${posicion}`.trim() !== '') {
            if (!posicionesValidas.includes(posicion)) {
                return res.status(400).json({ error: 'Posición inválida' });
            }
            posicionFinal = posicion;
        }

        let numeroFinal = null;
        if (numero !== undefined && numero !== null && `${numero}` !== '') {
            numeroFinal = parseInt(numero, 10);
            if (Number.isNaN(numeroFinal) || numeroFinal < 0) {
                return res.status(400).json({ error: 'Número inválido' });
            }
            if (equipoIdFinal !== null) {
                const numeroExists = await pool.query(
                    'SELECT 1 FROM jugadores WHERE equipo_id=$1 AND numero=$2',
                    [equipoIdFinal, numeroFinal]
                );
                if (numeroExists.rows.length > 0) {
                    return res.status(409).json({ error: 'Ya existe un jugador con ese número en el equipo' });
                }
            }
        }

        const result = await pool.query(
            'INSERT INTO jugadores (nombre, equipo_id, posicion, numero) VALUES ($1,$2,$3,$4) RETURNING *',
            [nombre.trim(), equipoIdFinal, posicionFinal, numeroFinal]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando jugador:', error);
        next(error);
    }
}

// PUT /api/jugadores/:id
async function actualizar(req, res, next) {
    try {
        const { id } = req.params;
        const { nombre, equipo_id, posicion, numero } = req.body;

        if (!nombre || !equipo_id) {
            return res.status(400).json({
                error: 'Nombre y equipo son requeridos'
            });
        }

        if (nombre.length < 2 || nombre.length > 100) {
            return res.status(400).json({
                error: 'El nombre debe tener entre 2 y 100 caracteres'
            });
        }

        const equipoExists = await pool.query('SELECT id FROM equipos WHERE id = $1', [equipo_id]);
        if (equipoExists.rows.length === 0) {
            return res.status(400).json({ error: 'El equipo especificado no existe' });
        }

        const posicionesValidas = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];
        if (posicion && !posicionesValidas.includes(posicion)) {
            return res.status(400).json({
                error: 'Posición inválida. Debe ser una de: ' + posicionesValidas.join(', ')
            });
        }

        if (numero) {
            const numeroExists = await pool.query(
                'SELECT id FROM jugadores WHERE equipo_id = $1 AND numero = $2 AND id != $3',
                [equipo_id, numero, id]
            );
            if (numeroExists.rows.length > 0) {
                return res.status(409).json({
                    error: 'Ya existe otro jugador con ese número en el equipo'
                });
            }
        }

        const result = await pool.query(
            'UPDATE jugadores SET nombre = $1, equipo_id = $2, posicion = $3, numero = $4 WHERE id = $5 RETURNING *',
            [nombre.trim(), equipo_id, posicion || null, numero || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        // SSE placeholder
        // notifyAllClients('player-updated', { category: 'general', jugadorId: parseInt(id), equipoId: equipo_id || null });

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando jugador:', error);
        next(error);
    }
}

// DELETE /api/jugadores/:id
async function eliminar(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM jugadores WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        res.json({
            message: 'Jugador eliminado correctamente',
            estadisticas_eliminadas: 'Se eliminaron automáticamente en cascada'
        });
    } catch (error) {
        console.error('Error eliminando jugador:', error);
        next(error);
    }
}

module.exports = {
    obtenerTodos,
    buscar,
    obtenerPorId,
    obtenerPartidos,
    obtenerSimilares,
    obtenerCompaneros,
    crear,
    actualizar,
    eliminar
};

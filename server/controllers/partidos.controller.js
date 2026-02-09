const pool = require('../config/database');
const { validarCrearPartido, validarActualizarPartido } = require('../validators/partidos.validator');

// GET /api/partidos
async function obtenerTodos(req, res, next) {
    try {
        const { estado, limit, page = 1, equipo_id, fecha_desde, fecha_hasta } = req.query;

        // CASO 1: Peticion simple del landing page
        if (estado && limit) {
            const simpleLimit = Number(limit) || 5;
            const simpleQuery = `
                SELECT
                    p.id,
                    el.nombre as equipo_local_nombre,
                    ev.nombre as equipo_visitante_nombre,
                    p.carreras_local,
                    p.carreras_visitante,
                    p.innings_jugados as innings,
                    p.fecha_partido
                FROM partidos p
                JOIN equipos el ON p.equipo_local_id = el.id
                JOIN equipos ev ON p.equipo_visitante_id = ev.id
                WHERE p.estado = $1
                ORDER BY p.fecha_partido DESC, p.hora DESC
                LIMIT $2;
            `;
            const { rows } = await pool.query(simpleQuery, [estado, simpleLimit]);
            return res.json(rows);
        }

        // CASO 2: Paginacion para admin
        const adminLimit = 20;
        const offset = (page - 1) * adminLimit;

        let query = `
            SELECT p.*,
                   el.nombre as equipo_local_nombre,
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (equipo_id) {
            query += ` AND (p.equipo_local_id = $${paramIndex} OR p.equipo_visitante_id = $${paramIndex})`;
            params.push(equipo_id);
            paramIndex++;
        }
        if (fecha_desde) {
            query += ` AND p.fecha_partido >= $${paramIndex}`;
            params.push(fecha_desde);
            paramIndex++;
        }
        if (fecha_hasta) {
            query += ` AND p.fecha_partido <= $${paramIndex}`;
            params.push(fecha_hasta);
            paramIndex++;
        }

        query += ` ORDER BY p.fecha_partido DESC, p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(adminLimit, offset);

        const result = await pool.query(query, params);

        let countQuery = 'SELECT COUNT(*) FROM partidos p WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (equipo_id) {
            countQuery += ` AND (p.equipo_local_id = $${countParamIndex} OR p.equipo_visitante_id = $${countParamIndex})`;
            countParams.push(equipo_id);
            countParamIndex++;
        }
        if (fecha_desde) {
            countQuery += ` AND p.fecha_partido >= $${countParamIndex}`;
            countParams.push(fecha_desde);
            countParamIndex++;
        }
        if (fecha_hasta) {
            countQuery += ` AND p.fecha_partido <= $${countParamIndex}`;
            countParams.push(fecha_hasta);
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        res.json({
            partidos: result.rows,
            pagination: {
                page: parseInt(page),
                limit: adminLimit,
                total,
                pages: Math.ceil(total / adminLimit)
            }
        });
    } catch (error) {
        console.error('Error obteniendo partidos:', error);
        next(error);
    }
}

// GET /api/partidos/proximos
async function obtenerProximos(req, res, next) {
    try {
        const query = `
            SELECT
                p.id, p.fecha_partido, p.hora, p.estado,
                p.equipo_local_id, p.equipo_visitante_id,
                p.carreras_local, p.carreras_visitante, p.innings_jugados,
                el.nombre as equipo_local_nombre,
                ev.nombre as equipo_visitante_nombre,
                el.ciudad as ciudad_local,
                ev.ciudad as ciudad_visitante
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.estado = 'programado'
               AND p.fecha_partido >= CURRENT_DATE
            ORDER BY p.fecha_partido ASC, p.hora ASC
            LIMIT 10
        `;

        const { rows: partidos } = await pool.query(query);

        if (partidos.length === 0) {
            return res.json([]);
        }

        const partidosConRecords = await Promise.all(partidos.map(async (partido) => {
            try {
                const recordLocal = await pool.query(`
                    SELECT
                        COUNT(*) FILTER (WHERE
                            (equipo_local_id = $1 AND carreras_local > carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante > carreras_local)
                        ) as victorias,
                        COUNT(*) FILTER (WHERE
                            (equipo_local_id = $1 AND carreras_local < carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante < carreras_local)
                        ) as derrotas
                    FROM partidos
                    WHERE (equipo_local_id = $1 OR equipo_visitante_id = $1)
                       AND estado = 'finalizado'
                       AND carreras_local IS NOT NULL
                       AND carreras_visitante IS NOT NULL
                `, [partido.equipo_local_id]);

                const recordVisitante = await pool.query(`
                    SELECT
                        COUNT(*) FILTER (WHERE
                            (equipo_local_id = $1 AND carreras_local > carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante > carreras_local)
                        ) as victorias,
                        COUNT(*) FILTER (WHERE
                            (equipo_local_id = $1 AND carreras_local < carreras_visitante) OR
                            (equipo_visitante_id = $1 AND carreras_visitante < carreras_local)
                        ) as derrotas
                    FROM partidos
                    WHERE (equipo_local_id = $1 OR equipo_visitante_id = $1)
                       AND estado = 'finalizado'
                       AND carreras_local IS NOT NULL
                       AND carreras_visitante IS NOT NULL
                `, [partido.equipo_visitante_id]);

                return {
                    ...partido,
                    record_local: `${recordLocal.rows[0]?.victorias || 0}-${recordLocal.rows[0]?.derrotas || 0}`,
                    record_visitante: `${recordVisitante.rows[0]?.victorias || 0}-${recordVisitante.rows[0]?.derrotas || 0}`
                };
            } catch (recordError) {
                console.error('Error calculando records:', recordError);
                return { ...partido, record_local: '0-0', record_visitante: '0-0' };
            }
        }));

        res.json(partidosConRecords);
    } catch (error) {
        console.error('Error obteniendo próximos partidos:', error);
        next(error);
    }
}

// GET /api/partidos/:id
async function obtenerPorId(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT p.*,
                   el.nombre as equipo_local_nombre,
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            LEFT JOIN equipos el ON p.equipo_local_id = el.id
            LEFT JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo partido:', error);
        next(error);
    }
}

// POST /api/partidos
async function crear(req, res, next) {
    try {
        const validation = validarCrearPartido(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const {
            equipo_local_id, equipo_visitante_id,
            carreras_local, carreras_visitante,
            innings_jugados, fecha_partido, hora, estado
        } = validation.sanitized;

        // Verificar que ambos equipos existen
        const equiposCheck = await pool.query(
            'SELECT id FROM equipos WHERE id IN ($1, $2)',
            [equipo_local_id, equipo_visitante_id]
        );
        if (equiposCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Uno o ambos equipos no existen' });
        }

        const result = await pool.query(
            `INSERT INTO partidos (equipo_local_id, equipo_visitante_id, carreras_local,
                                   carreras_visitante, innings_jugados, fecha_partido, hora, estado)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [equipo_local_id, equipo_visitante_id, carreras_local,
             carreras_visitante, innings_jugados, fecha_partido,
             hora, estado]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando partido:', error);
        next(error);
    }
}

// PUT /api/partidos/:id
async function actualizar(req, res, next) {
    try {
        const { id } = req.params;

        const validation = validarActualizarPartido(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0] });
        }

        const {
            equipo_local_id, equipo_visitante_id,
            carreras_local, carreras_visitante,
            innings_jugados, fecha_partido, estado
        } = validation.sanitized;

        // Verificar que ambos equipos existen
        const equiposCheck = await pool.query(
            'SELECT id FROM equipos WHERE id IN ($1, $2)',
            [equipo_local_id, equipo_visitante_id]
        );
        if (equiposCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Uno o ambos equipos no existen' });
        }

        const result = await pool.query(
            `UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2,
                                 carreras_local = $3, carreras_visitante = $4,
                                 innings_jugados = $5, fecha_partido = $6, estado = $8
             WHERE id = $7 RETURNING *`,
            [equipo_local_id, equipo_visitante_id, carreras_local,
             carreras_visitante, innings_jugados, fecha_partido, id, estado]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando partido:', error);
        next(error);
    }
}

// DELETE /api/partidos/:id
async function eliminar(req, res, next) {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM partidos WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        res.json({ message: 'Partido eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando partido:', error);
        next(error);
    }
}

module.exports = {
    obtenerTodos,
    obtenerProximos,
    obtenerPorId,
    crear,
    actualizar,
    eliminar
};

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================================================
// =================== MIDDLEWARE DE LOGGING ===================
// ===============================================================
const logger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
};

// ===============================================================
// ============= MIDDLEWARE DE VALIDACIÓN GLOBAL ================
// ===============================================================
const validateRequest = (req, res, next) => {
    const dangerousHeaders = ['x-forwarded-for', 'x-real-ip'];
    for (let header of dangerousHeaders) {
        if (req.headers[header] && req.headers[header].includes('script')) {
            return res.status(400).json({ error: 'Invalid request headers' });
        }
    }
    next();
};

// ===============================================================
// ================ CONFIGURACIÓN CORS MEJORADA =================
// ===============================================================
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:8080',
        'https://choguileague2025.github.io',
        'https://chogui-league-system-production.up.railway.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
}));

// ===============================================================
// ====================== MIDDLEWARES ===========================
// ===============================================================
app.use(logger);
app.use(validateRequest);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Servir archivos estáticos con caché
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    etag: false
}));

// ===============================================================
// ============= MIDDLEWARE DE MANEJO DE ERRORES ================
// ===============================================================
const errorHandler = (err, req, res, next) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${err.message}`);
    console.error(err.stack);
    
    if (err.code === '23505') {
        return res.status(409).json({ error: 'Registro duplicado' });
    }
    
    if (err.code === '23503') {
        return res.status(400).json({ error: 'Referencia inválida en base de datos' });
    }
    
    res.status(500).json({ 
        error: 'Error interno del servidor',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
};

// ===============================================================
// ============= FUNCIÓN INICIALIZAR BASE DE DATOS ==============
// ===============================================================
async function inicializarBaseDeDatos() {
    try {
        console.log('🔄 Verificando conexión a base de datos...');
        await pool.query('SELECT NOW()');
        console.log('✅ Conexión a base de datos establecida');

        // Crear tablas principales
        const tables = [
            {
                name: 'equipos',
                query: `CREATE TABLE IF NOT EXISTS equipos (
                    id SERIAL PRIMARY KEY, 
                    nombre VARCHAR(100) UNIQUE NOT NULL, 
                    manager VARCHAR(100) NOT NULL, 
                    ciudad VARCHAR(100) NOT NULL, 
                    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );`
            },
            {
                name: 'jugadores',
                query: `CREATE TABLE IF NOT EXISTS jugadores (
                    id SERIAL PRIMARY KEY, 
                    nombre VARCHAR(100) NOT NULL, 
                    equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL, 
                    posicion VARCHAR(10), 
                    numero INTEGER, 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );`
            },
            {
                name: 'partidos',
                query: `CREATE TABLE IF NOT EXISTS partidos (
                    id SERIAL PRIMARY KEY, 
                    equipo_local_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE, 
                    equipo_visitante_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE, 
                    carreras_local INTEGER, 
                    carreras_visitante INTEGER, 
                    innings_jugados INTEGER DEFAULT 9, 
                    fecha_partido DATE NOT NULL, 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );`
            },
            {
                name: 'usuarios',
                query: `CREATE TABLE IF NOT EXISTS usuarios (
                    id SERIAL PRIMARY KEY, 
                    username VARCHAR(50) UNIQUE NOT NULL, 
                    password VARCHAR(255) NOT NULL, 
                    role VARCHAR(20) NOT NULL DEFAULT 'admin', 
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );`
            },
            {
                name: 'torneos',
                query: `CREATE TABLE IF NOT EXISTS torneos (
                    id SERIAL PRIMARY KEY, 
                    nombre VARCHAR(100) UNIQUE NOT NULL, 
                    activo BOOLEAN DEFAULT false, 
                    fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );`
            },
            {
                name: 'estadisticas_ofensivas',
                query: `CREATE TABLE IF NOT EXISTS estadisticas_ofensivas (
                    id SERIAL PRIMARY KEY, 
                    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE, 
                    temporada VARCHAR(50), 
                    at_bats INTEGER DEFAULT 0, 
                    hits INTEGER DEFAULT 0, 
                    home_runs INTEGER DEFAULT 0, 
                    rbi INTEGER DEFAULT 0, 
                    runs INTEGER DEFAULT 0, 
                    walks INTEGER DEFAULT 0, 
                    stolen_bases INTEGER DEFAULT 0, 
                    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
                    UNIQUE(jugador_id, temporada)
                );`
            },
            {
                name: 'estadisticas_pitcheo',
                query: `CREATE TABLE IF NOT EXISTS estadisticas_pitcheo (
                    id SERIAL PRIMARY KEY, 
                    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE, 
                    temporada VARCHAR(50), 
                    innings_pitched NUMERIC(4,1) DEFAULT 0.0, 
                    hits_allowed INTEGER DEFAULT 0, 
                    earned_runs INTEGER DEFAULT 0, 
                    strikeouts INTEGER DEFAULT 0, 
                    walks_allowed INTEGER DEFAULT 0, 
                    home_runs_allowed INTEGER DEFAULT 0, 
                    wins INTEGER DEFAULT 0, 
                    losses INTEGER DEFAULT 0, 
                    saves INTEGER DEFAULT 0, 
                    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
                    UNIQUE(jugador_id, temporada)
                );`
            },
            {
                name: 'estadisticas_defensivas',
                query: `CREATE TABLE IF NOT EXISTS estadisticas_defensivas (
                    id SERIAL PRIMARY KEY, 
                    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE, 
                    temporada VARCHAR(50), 
                    putouts INTEGER DEFAULT 0, 
                    assists INTEGER DEFAULT 0, 
                    errors INTEGER DEFAULT 0, 
                    double_plays INTEGER DEFAULT 0, 
                    passed_balls INTEGER DEFAULT 0, 
                    chances INTEGER DEFAULT 0, 
                    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
                    UNIQUE(jugador_id, temporada)
                );`
            }
        ];

        for (const table of tables) {
            await pool.query(table.query);
            console.log(`✅ Tabla ${table.name} verificada`);
        }

        // Crear índices para optimización
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_jugadores_equipo ON jugadores(equipo_id);',
            'CREATE INDEX IF NOT EXISTS idx_partidos_equipos ON partidos(equipo_local_id, equipo_visitante_id);',
            'CREATE INDEX IF NOT EXISTS idx_estadisticas_jugador ON estadisticas_ofensivas(jugador_id);',
            'CREATE INDEX IF NOT EXISTS idx_estadisticas_temporada ON estadisticas_ofensivas(temporada);'
        ];

        for (const indexQuery of indexes) {
            await pool.query(indexQuery);
        }
        console.log('✅ Índices de base de datos optimizados');

        // Crear usuario administrador
        const adminUsername = 'admin';
        const adminPassword = 'admin';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await pool.query(
            `INSERT INTO usuarios (username, password, role) 
             VALUES ($1, $2, 'admin') 
             ON CONFLICT (username) DO UPDATE SET password = $2;`, 
            [adminUsername, hashedPassword]
        );
        
        console.log('✅ Usuario administrador configurado');
        console.log('✅ Base de datos inicializada correctamente');

    } catch (error) {
        console.error('❌ Error fatal al inicializar la base de datos:', error);
        throw error;
    }
}

// ===============================================================
// ======================= RUTAS API ============================
// ===============================================================

// ... (TODAS TUS RUTAS API VAN AQUÍ, SIN CAMBIOS) ...
// ====================== AUTENTICACIÓN =========================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Usuario y contraseña son requeridos' 
            });
        }

        if (username.length > 50 || password.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        const userResult = await pool.query(
            'SELECT * FROM usuarios WHERE username = $1', 
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario o contraseña incorrectos' 
            });
        }
        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (isMatch) {
            res.json({ 
                success: true, 
                message: 'Login exitoso', 
                user: { 
                    username: user.username, 
                    role: user.role 
                } 
            });
        } else {
            return res.status(401).json({ 
                success: false, 
                message: 'Usuario o contraseña incorrectos' 
            });
        }
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor' 
        });
    }
});

// ====================== TORNEOS =============================
app.get('/api/torneos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM torneos ORDER BY fecha_inicio DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo torneos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/torneos/activo', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM torneos WHERE activo = true LIMIT 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No hay torneo activo' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo torneo activo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/torneos', async (req, res) => {
    try {
        const { nombre } = req.body;
        
        if (!nombre || nombre.length < 3) {
            return res.status(400).json({ 
                error: 'El nombre del torneo debe tener al menos 3 caracteres' 
            });
        }

        const result = await pool.query(
            'INSERT INTO torneos (nombre) VALUES ($1) RETURNING *',
            [nombre.trim()]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un torneo con ese nombre' });
        }
        console.error('Error creando torneo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Resto de rutas de torneos
app.put('/api/torneos/:id/activar', async (req, res) => {
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/torneos/desactivar-todos', async (req, res) => {
    try {
        await pool.query('UPDATE torneos SET activo = false');
        res.json({ message: 'Todos los torneos desactivados' });
    } catch (error) {
        console.error('Error desactivando torneos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/torneos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre } = req.body;
        
        if (!nombre || nombre.length < 3) {
            return res.status(400).json({ 
                error: 'El nombre del torneo debe tener al menos 3 caracteres' 
            });
        }

        const result = await pool.query(
            'UPDATE torneos SET nombre = $1 WHERE id = $2 RETURNING *',
            [nombre.trim(), id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un torneo con ese nombre' });
        }
        console.error('Error actualizando torneo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/torneos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const statsCheck = await pool.query(`
            SELECT COUNT(*) as count FROM (
                SELECT 1 FROM estadisticas_ofensivas WHERE temporada IN (SELECT nombre FROM torneos WHERE id = $1)
                UNION ALL
                SELECT 1 FROM estadisticas_pitcheo WHERE temporada IN (SELECT nombre FROM torneos WHERE id = $1)
                UNION ALL
                SELECT 1 FROM estadisticas_defensivas WHERE temporada IN (SELECT nombre FROM torneos WHERE id = $1)
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== EQUIPOS =============================
app.get('/api/equipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM equipos ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo equipos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM equipos WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/equipos/:id/detalles', async (req, res) => {
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
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

app.get('/api/equipos/:id/estadisticas/ofensivas', async (req, res) => {
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
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

app.post('/api/equipos', async (req, res) => {
    try {
        const { nombre, manager, ciudad } = req.body;
        
        if (!nombre || !manager || !ciudad) {
            return res.status(400).json({ 
                error: 'Nombre, manager y ciudad son requeridos' 
            });
        }

        if (nombre.length < 2 || manager.length < 2 || ciudad.length < 2) {
            return res.status(400).json({ 
                error: 'Todos los campos deben tener al menos 2 caracteres' 
            });
        }

        const result = await pool.query(
            'INSERT INTO equipos (nombre, manager, ciudad) VALUES ($1, $2, $3) RETURNING *',
            [nombre.trim(), manager.trim(), ciudad.trim()]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un equipo con ese nombre' });
        }
        console.error('Error creando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
// ====================== EQUIPOS COMPLETADOS =========================
// (Agregar después de las rutas de equipos existentes)

app.put('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, manager, ciudad } = req.body;
        
        // Validaciones robustas
        if (!nombre || !manager || !ciudad) {
            return res.status(400).json({ 
                error: 'Nombre, manager y ciudad son requeridos' 
            });
        }

        if (nombre.length < 2 || manager.length < 2 || ciudad.length < 2) {
            return res.status(400).json({ 
                error: 'Todos los campos deben tener al menos 2 caracteres' 
            });
        }

        if (nombre.length > 100 || manager.length > 100 || ciudad.length > 100) {
            return res.status(400).json({ 
                error: 'Los campos no pueden exceder 100 caracteres' 
            });
        }

        const result = await pool.query(
            'UPDATE equipos SET nombre = $1, manager = $2, ciudad = $3 WHERE id = $4 RETURNING *',
            [nombre.trim(), manager.trim(), ciudad.trim(), id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un equipo con ese nombre' });
        }
        console.error('Error actualizando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar si el equipo tiene jugadores asociados
        const jugadoresCheck = await pool.query(
            'SELECT COUNT(*) as count FROM jugadores WHERE equipo_id = $1', 
            [id]
        );
        
        if (parseInt(jugadoresCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar el equipo porque tiene jugadores asociados' 
            });
        }
        
        const result = await pool.query(
            'DELETE FROM equipos WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        
        res.json({ message: 'Equipo eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando equipo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== JUGADORES COMPLETADOS =========================

app.get('/api/jugadores', async (req, res) => {
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

        // Filtros opcionales
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
        
        // Contar total para paginación
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT j.*, e.nombre as equipo_nombre 
            FROM jugadores j 
            LEFT JOIN equipos e ON j.equipo_id = e.id 
            WHERE j.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/jugadores', async (req, res) => {
    try {
        const { nombre, equipo_id, posicion, numero } = req.body;
        
        // Validaciones mejoradas
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

        // Verificar que el equipo existe
        const equipoExists = await pool.query('SELECT id FROM equipos WHERE id = $1', [equipo_id]);
        if (equipoExists.rows.length === 0) {
            return res.status(400).json({ error: 'El equipo especificado no existe' });
        }

        // Validar posición si se proporciona
        const posicionesValidas = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];
        if (posicion && !posicionesValidas.includes(posicion)) {
            return res.status(400).json({ 
                error: 'Posición inválida. Debe ser una de: ' + posicionesValidas.join(', ') 
            });
        }

        // Validar número único por equipo si se proporciona
        if (numero) {
            const numeroExists = await pool.query(
                'SELECT id FROM jugadores WHERE equipo_id = $1 AND numero = $2', 
                [equipo_id, numero]
            );
            if (numeroExists.rows.length > 0) {
                return res.status(409).json({ 
                    error: 'Ya existe un jugador con ese número en el equipo' 
                });
            }
        }

        const result = await pool.query(
            'INSERT INTO jugadores (nombre, equipo_id, posicion, numero) VALUES ($1, $2, $3, $4) RETURNING *',
            [nombre.trim(), equipo_id, posicion || null, numero || null]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, equipo_id, posicion, numero } = req.body;
        
        // Validaciones
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

        // Verificar que el equipo existe
        const equipoExists = await pool.query('SELECT id FROM equipos WHERE id = $1', [equipo_id]);
        if (equipoExists.rows.length === 0) {
            return res.status(400).json({ error: 'El equipo especificado no existe' });
        }

        // Validar posición
        const posicionesValidas = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];
        if (posicion && !posicionesValidas.includes(posicion)) {
            return res.status(400).json({ 
                error: 'Posición inválida. Debe ser una de: ' + posicionesValidas.join(', ') 
            });
        }

        // Validar número único por equipo (excluyendo el jugador actual)
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
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar si el jugador tiene estadísticas asociadas
        const statsCheck = await pool.query(`
            SELECT COUNT(*) as count FROM (
                SELECT 1 FROM estadisticas_ofensivas WHERE jugador_id = $1
                UNION ALL
                SELECT 1 FROM estadisticas_pitcheo WHERE jugador_id = $1
                UNION ALL
                SELECT 1 FROM estadisticas_defensivas WHERE jugador_id = $1
            ) as stats
        `, [id]);
        
        if (parseInt(statsCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar el jugador porque tiene estadísticas asociadas' 
            });
        }
        
        const result = await pool.query(
            'DELETE FROM jugadores WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        
        res.json({ message: 'Jugador eliminado correctamente' });
    } catch (error) {
        console.error('Error eliminando jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== PARTIDOS COMPLETADOS =========================

app.get('/api/partidos', async (req, res) => {
    try {
        const { page = 1, limit = 20, equipo_id, fecha_desde, fecha_hasta } = req.query;
        const offset = (page - 1) * limit;
        
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

        // Filtros opcionales
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
        params.push(limit, offset);

        const result = await pool.query(query, params);
        
        // Contar total
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
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error obteniendo partidos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/partidos/:id', async (req, res) => {
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/partidos', async (req, res) => {
    try {
        const { 
            equipo_local_id, 
            equipo_visitante_id, 
            carreras_local, 
            carreras_visitante, 
            innings_jugados = 9, 
            fecha_partido 
        } = req.body;
        
        // Validaciones robustas
        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ 
                error: 'Equipo local, equipo visitante y fecha son requeridos' 
            });
        }

        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ 
                error: 'El equipo local y visitante deben ser diferentes' 
            });
        }

        // Verificar que ambos equipos existen
        const equiposCheck = await pool.query(
            'SELECT id FROM equipos WHERE id IN ($1, $2)', 
            [equipo_local_id, equipo_visitante_id]
        );
        
        if (equiposCheck.rows.length !== 2) {
            return res.status(400).json({ error: 'Uno o ambos equipos no existen' });
        }

        // Validar carreras si se proporcionan
        if (carreras_local !== null && carreras_local !== undefined && carreras_local < 0) {
            return res.status(400).json({ error: 'Las carreras no pueden ser negativas' });
        }

        if (carreras_visitante !== null && carreras_visitante !== undefined && carreras_visitante < 0) {
            return res.status(400).json({ error: 'Las carreras no pueden ser negativas' });
        }

        // Validar innings
        if (innings_jugados < 1 || innings_jugados > 20) {
            return res.status(400).json({ 
                error: 'Los innings jugados deben estar entre 1 y 20' 
            });
        }

        // Validar fecha (no muy en el futuro)
        const fechaPartidoDate = new Date(fecha_partido);
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() + 365); // Máximo 1 año en el futuro
        
        if (fechaPartidoDate > fechaLimite) {
            return res.status(400).json({ 
                error: 'La fecha del partido no puede ser más de 1 año en el futuro' 
            });
        }

        const result = await pool.query(
            `INSERT INTO partidos (equipo_local_id, equipo_visitante_id, carreras_local, 
                                   carreras_visitante, innings_jugados, fecha_partido) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [equipo_local_id, equipo_visitante_id, carreras_local || null, 
             carreras_visitante || null, innings_jugados, fecha_partido]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            equipo_local_id, 
            equipo_visitante_id, 
            carreras_local, 
            carreras_visitante, 
            innings_jugados, 
            fecha_partido 
        } = req.body;
        
        // Mismas validaciones que POST
        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ 
                error: 'Equipo local, equipo visitante y fecha son requeridos' 
            });
        }

        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ 
                error: 'El equipo local y visitante deben ser diferentes' 
            });
        }

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
                                 innings_jugados = $5, fecha_partido = $6 
             WHERE id = $7 RETURNING *`,
            [equipo_local_id, equipo_visitante_id, carreras_local || null, 
             carreras_visitante || null, innings_jugados || 9, fecha_partido, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/partidos/:id', async (req, res) => {
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== ESTADÍSTICAS MEJORADAS =========================

app.get('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const { temporada, equipo_id, min_at_bats = 0 } = req.query;
        
        let query = `
            SELECT eo.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
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

        if (temporada) {
            query += ` AND eo.temporada = $${paramIndex}`;
            params.push(temporada);
            paramIndex++;
        }

        if (equipo_id) {
            query += ` AND j.equipo_id = $${paramIndex}`;
            params.push(equipo_id);
        }

        query += ` ORDER BY avg DESC, eo.hits DESC`;

        const result = await pool.query(query, params);
        
        // Calcular OPS para cada jugador
        const jugadoresConOPS = result.rows.map(jugador => ({
            ...jugador,
            ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3))
        }));
        
        res.json(jugadoresConOPS);
    } catch (error) {
        console.error('Error obteniendo estadísticas ofensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/lideres-ofensivos', async (req, res) => {
    try {
        const { min_at_bats = 10 } = req.query;
        
        const result = await pool.query(`
            SELECT eo.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   ROUND(eo.hits::DECIMAL / eo.at_bats, 3) as avg,
                   ROUND((eo.hits + eo.walks)::DECIMAL / (eo.at_bats + eo.walks), 3) as obp,
                   ROUND((eo.hits + eo.home_runs * 3)::DECIMAL / eo.at_bats, 3) as slg
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON eo.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE eo.at_bats >= $1
            ORDER BY avg DESC
        `, [min_at_bats]);
        
        const jugadoresConOPS = result.rows.map(jugador => ({
            ...jugador,
            ops: parseFloat((parseFloat(jugador.obp) + parseFloat(jugador.slg)).toFixed(3))
        }));
        
        res.json(jugadoresConOPS);
    } catch (error) {
        console.error('Error obteniendo líderes ofensivos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Rutas similares para estadísticas de pitcheo y defensivas...
// (Agregar según sea necesario)

// ====================== NUEVA RUTA PARA DASHBOARD =========================

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const stats = await Promise.all([
            pool.query('SELECT COUNT(*) as total FROM equipos'),
            pool.query('SELECT COUNT(*) as total FROM jugadores'),
            pool.query('SELECT COUNT(*) as total FROM partidos'),
            pool.query('SELECT COUNT(*) as total FROM estadisticas_ofensivas WHERE at_bats > 0'),
        ]);

        res.json({
            equipos: parseInt(stats[0].rows[0].total),
            jugadores: parseInt(stats[1].rows[0].total),
            partidos: parseInt(stats[2].rows[0].total),
            jugadores_con_stats: parseInt(stats[3].rows[0].total)
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas del dashboard:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== ESTADÍSTICAS PITCHEO =========================
app.get('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ep.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre,
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
            ORDER BY era ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/estadisticas-pitcheo/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT ep.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ep.jugador_id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas de pitcheo no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const { 
            jugador_id, innings_pitched, hits_allowed, earned_runs, 
            strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const result = await pool.query(`
            INSERT INTO estadisticas_pitcheo (
                jugador_id, temporada, innings_pitched, hits_allowed, earned_runs,
                strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (jugador_id, temporada) 
            DO UPDATE SET 
                innings_pitched = estadisticas_pitcheo.innings_pitched + EXCLUDED.innings_pitched,
                hits_allowed = estadisticas_pitcheo.hits_allowed + EXCLUDED.hits_allowed,
                earned_runs = estadisticas_pitcheo.earned_runs + EXCLUDED.earned_runs,
                strikeouts = estadisticas_pitcheo.strikeouts + EXCLUDED.strikeouts,
                walks_allowed = estadisticas_pitcheo.walks_allowed + EXCLUDED.walks_allowed,
                home_runs_allowed = estadisticas_pitcheo.home_runs_allowed + EXCLUDED.home_runs_allowed,
                wins = estadisticas_pitcheo.wins + EXCLUDED.wins,
                losses = estadisticas_pitcheo.losses + EXCLUDED.losses,
                saves = estadisticas_pitcheo.saves + EXCLUDED.saves
            RETURNING *
        `, [jugador_id, temporada || 'Default', innings_pitched || 0, hits_allowed || 0, 
            earned_runs || 0, strikeouts || 0, walks_allowed || 0, home_runs_allowed || 0,
            wins || 0, losses || 0, saves || 0]);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/estadisticas-pitcheo', async (req, res) => {
    try {
        const { 
            jugador_id, innings_pitched, hits_allowed, earned_runs, 
            strikeouts, walks_allowed, home_runs_allowed, wins, losses, saves, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const result = await pool.query(`
            UPDATE estadisticas_pitcheo SET 
                innings_pitched = $1, hits_allowed = $2, earned_runs = $3,
                strikeouts = $4, walks_allowed = $5, home_runs_allowed = $6,
                wins = $7, losses = $8, saves = $9
            WHERE jugador_id = $10 AND temporada = $11
            RETURNING *
        `, [innings_pitched || 0, hits_allowed || 0, earned_runs || 0, strikeouts || 0,
            walks_allowed || 0, home_runs_allowed || 0, wins || 0, losses || 0, 
            saves || 0, jugador_id, temporada || 'Default']);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas de pitcheo no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando estadísticas de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== ESTADÍSTICAS DEFENSIVAS =========================
app.get('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   CASE 
                       WHEN ed.chances > 0 THEN ROUND((ed.putouts + ed.assists)::DECIMAL / ed.chances, 3)
                       ELSE 0.000 
                   END as fielding_percentage
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            ORDER BY fielding_percentage DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/estadisticas-defensivas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ed.jugador_id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas defensivas no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const { 
            jugador_id, putouts, assists, errors, double_plays, 
            passed_balls, chances, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const result = await pool.query(`
            INSERT INTO estadisticas_defensivas (
                jugador_id, temporada, putouts, assists, errors, 
                double_plays, passed_balls, chances
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (jugador_id, temporada) 
            DO UPDATE SET 
                putouts = estadisticas_defensivas.putouts + EXCLUDED.putouts,
                assists = estadisticas_defensivas.assists + EXCLUDED.assists,
                errors = estadisticas_defensivas.errors + EXCLUDED.errors,
                double_plays = estadisticas_defensivas.double_plays + EXCLUDED.double_plays,
                passed_balls = estadisticas_defensivas.passed_balls + EXCLUDED.passed_balls,
                chances = estadisticas_defensivas.chances + EXCLUDED.chances
            RETURNING *
        `, [jugador_id, temporada || 'Default', putouts || 0, assists || 0, 
            errors || 0, double_plays || 0, passed_balls || 0, chances || 0]);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/estadisticas-defensivas', async (req, res) => {
    try {
        const { 
            jugador_id, putouts, assists, errors, double_plays, 
            passed_balls, chances, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        const result = await pool.query(`
            UPDATE estadisticas_defensivas SET 
                putouts = $1, assists = $2, errors = $3, double_plays = $4,
                passed_balls = $5, chances = $6
            WHERE jugador_id = $7 AND temporada = $8
            RETURNING *
        `, [putouts || 0, assists || 0, errors || 0, double_plays || 0,
            passed_balls || 0, chances || 0, jugador_id, temporada || 'Default']);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas defensivas no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando estadísticas defensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== LÍDERES DEFENSIVOS =========================
app.get('/api/lideres-defensivos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ed.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre,
                   CASE 
                       WHEN ed.chances >= 5 THEN ROUND((ed.putouts + ed.assists)::DECIMAL / ed.chances, 3)
                       ELSE 0.000 
                   END as fielding_percentage,
                   ed.chances as total_chances
            FROM estadisticas_defensivas ed
            JOIN jugadores j ON ed.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ed.chances >= 5
            ORDER BY fielding_percentage DESC, ed.chances DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo líderes defensivos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== LÍDERES PITCHEO =========================
app.get('/api/lideres-pitcheo', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ep.*, j.nombre as jugador_nombre, e.nombre as equipo_nombre,
                   CASE 
                       WHEN ep.innings_pitched >= 5 THEN ROUND((ep.earned_runs * 9.0) / ep.innings_pitched, 2)
                       ELSE 99.99 
                   END as era,
                   CASE 
                       WHEN ep.innings_pitched >= 5 THEN ROUND((ep.hits_allowed + ep.walks_allowed) / ep.innings_pitched, 2)
                       ELSE 99.99 
                   END as whip
            FROM estadisticas_pitcheo ep
            JOIN jugadores j ON ep.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            WHERE ep.innings_pitched >= 5
            ORDER BY era ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo líderes de pitcheo:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== ESTADÍSTICAS OFENSIVAS MEJORADAS =========================
app.post('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const { 
            jugador_id, at_bats, hits, home_runs, rbi, runs, walks, stolen_bases, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        if (hits > at_bats) {
            return res.status(400).json({ error: 'Los hits no pueden ser mayores que los at-bats' });
        }

        const result = await pool.query(`
            INSERT INTO estadisticas_ofensivas (
                jugador_id, temporada, at_bats, hits, home_runs, rbi, runs, walks, stolen_bases
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (jugador_id, temporada) 
            DO UPDATE SET 
                at_bats = estadisticas_ofensivas.at_bats + EXCLUDED.at_bats,
                hits = estadisticas_ofensivas.hits + EXCLUDED.hits,
                home_runs = estadisticas_ofensivas.home_runs + EXCLUDED.home_runs,
                rbi = estadisticas_ofensivas.rbi + EXCLUDED.rbi,
                runs = estadisticas_ofensivas.runs + EXCLUDED.runs,
                walks = estadisticas_ofensivas.walks + EXCLUDED.walks,
                stolen_bases = estadisticas_ofensivas.stolen_bases + EXCLUDED.stolen_bases
            RETURNING *
        `, [jugador_id, temporada || 'Default', at_bats || 0, hits || 0, 
            home_runs || 0, rbi || 0, runs || 0, walks || 0, stolen_bases || 0]);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creando estadísticas ofensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const { 
            jugador_id, at_bats, hits, home_runs, rbi, runs, walks, stolen_bases, temporada 
        } = req.body;
        
        if (!jugador_id) {
            return res.status(400).json({ error: 'ID del jugador es requerido' });
        }

        if (hits > at_bats) {
            return res.status(400).json({ error: 'Los hits no pueden ser mayores que los at-bats' });
        }

        const result = await pool.query(`
            UPDATE estadisticas_ofensivas SET 
                at_bats = $1, hits = $2, home_runs = $3, rbi = $4,
                runs = $5, walks = $6, stolen_bases = $7
            WHERE jugador_id = $8 AND temporada = $9
            RETURNING *
        `, [at_bats || 0, hits || 0, home_runs || 0, rbi || 0,
            runs || 0, walks || 0, stolen_bases || 0, jugador_id, temporada || 'Default']);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas ofensivas no encontradas' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error actualizando estadísticas ofensivas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ===============================================================
// =================== RUTAS DE ARCHIVOS HTML =================
// ===============================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/equipo.html', (req, res) => res.sendFile(path.join(__dirname, 'public/equipo.html')));
app.get('/public', (req, res) => res.sendFile(path.join(__dirname, 'public/public.html')));


// ==================== OPTIMIZACIONES PARA RAILWAY ====================
// const path = require('path'); // Ya está requerido al inicio del archivo

// Servir archivos estáticos optimizados
app.use(express.static('.', {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Servir logos estáticos con headers optimizados
app.use('/public/images/logos', express.static(path.join(__dirname, 'public/images/logos'), {
  maxAge: '7d', // Cache de 7 días para logos
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 días
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// Verificar estructura de logos al iniciar
const fs = require('fs');

function verificarLogos() {
  const logosPath = path.join(__dirname, 'public/images/logos');
  
  if (!fs.existsSync(logosPath)) {
    console.warn('⚠️ Carpeta de logos no encontrada, creando...');
    fs.mkdirSync(logosPath, { recursive: true });
  }
  
  const logosRequeridos = [
    'chogui-league.png',
    'default-logo.png',
    'guerreros-del-norte.png',
    'la-guaira.png',
    'furia-del-caribe.png',
    'tigres-unidos.png',
    'leones-dorados.png',
    'aguilas-negras.png',
    'venearstone.png',
    'desss.png',
    'caribes-rd.png'
  ];
  
  let logosFaltantes = [];
  
  logosRequeridos.forEach(logo => {
    const logoPath = path.join(logosPath, logo);
    if (!fs.existsSync(logoPath)) {
      logosFaltantes.push(logo);
    }
  });
  
  if (logosFaltantes.length > 0) {
    console.warn('⚠️ Logos faltantes:', logosFaltantes);
    console.log('💡 Sugerencia: Agregar archivos PNG a /public/images/logos/');
  } else {
    console.log('✅ Todos los logos están disponibles');
  }
}

// // Manejo de 404 para SPA - ELIMINADO SEGÚN INSTRUCCIONES
// app.get('*', (req, res) => {
//   if (req.path.startsWith('/api/')) {
//     res.status(404).json({ error: 'Endpoint no encontrado' });
//   } else {
//     res.sendFile(path.join(__dirname, 'index.html'));
//   }
// });

// Ejecutar verificación al iniciar servidor
verificarLogos();

console.log('🚀 Chogui League System optimizado para Railway');


// ===============================================================
// =================== MIDDLEWARE FINAL =========================
// ===============================================================
app.use(errorHandler);

// ===============================================================
// =================== INICIAR SERVIDOR ========================
// ===============================================================
async function startServer() {
    try {
        console.log('🚀 Iniciando Chogui League System...');
        console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
        
        await inicializarBaseDeDatos();
        
        app.listen(PORT, () => {
            console.log(`\n🔥 =====================================`);
            console.log(`🏆 CHOGUI LEAGUE SYSTEM ACTIVO`);
            console.log(`🔥 =====================================`);
            console.log(`🌐 Puerto: ${PORT}`);
            console.log(`📊 Base de datos: Conectada`);
            console.log(`✅ APIs: Optimizadas`);
            console.log(`🛡️  Seguridad: Activa`);
            console.log(`🔥 =====================================\n`);
        });
        
    } catch (error) {
        console.error("❌ No se pudo iniciar el servidor:", error);
        process.exit(1);
    }
}

// Manejo graceful de cierre del servidor
process.on('SIGTERM', () => {
    console.log('🔄 Cerrando servidor...');
    pool.end(() => {
        console.log('✅ Conexiones de base de datos cerradas');
        process.exit(0);
    });
});

startServer();
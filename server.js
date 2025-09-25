const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración CORS unificada
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:8080',
        'https://choguileague2025.github.io',
        'https://chogui-league-system-production.up.railway.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middlewares
app.use(express.json());
app.use(cookieParser());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));


// =================================================================
// =========== FUNCIÓN PARA INICIALIZAR LA BASE DE DATOS ===========
// =================================================================
async function inicializarBaseDeDatos() {
    try {
        // Crear tabla de equipos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS equipos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) UNIQUE NOT NULL,
                manager VARCHAR(100) NOT NULL,
                ciudad VARCHAR(100) NOT NULL,
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Crear tabla de jugadores
        await pool.query(`
            CREATE TABLE IF NOT EXISTS jugadores (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
                posicion VARCHAR(10),
                numero INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Crear tabla de partidos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS partidos (
                id SERIAL PRIMARY KEY,
                equipo_local_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
                equipo_visitante_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
                carreras_local INTEGER,
                carreras_visitante INTEGER,
                innings_jugados INTEGER DEFAULT 9,
                fecha_partido DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Crear tabla de usuarios
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Crear tablas de estadísticas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS estadisticas_ofensivas (
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
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS estadisticas_pitcheo (
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
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS estadisticas_defensivas (
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
            );
        `);
        
        // Crear tabla de torneos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS torneos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) UNIQUE NOT NULL,
                activo BOOLEAN DEFAULT false,
                fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Verificación de tablas base completada.');

        // Asegurar que el usuario admin exista y tenga la contraseña correcta
        const adminUsername = 'admin';
        const adminPassword = 'admin';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await pool.query(
            `INSERT INTO usuarios (username, password, role) VALUES ($1, $2, 'admin') ON CONFLICT (username) DO UPDATE SET password = $2;`,
            [adminUsername, hashedPassword]
        );
        
        console.log('✅ Usuario administrador asegurado.');

    } catch (error) {
        console.error('❌ Error fatal al inicializar la base de datos:', error);
    }
}


// =================================================================
// ====================== RUTAS DE LA API ==========================
// =================================================================

// Ruta de prueba
app.get('/api/test', (req, res) => res.json({ message: 'Servidor funcionando' }));

// ====================== AUTENTICACIÓN ============================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos' });
        }
        const userResult = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }
        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            res.json({
                success: true,
                message: 'Login exitoso',
                user: { username: user.username, role: user.role }
            });
        } else {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

// ====================== TORNEOS ======================
app.get('/api/torneos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM torneos ORDER BY fecha_inicio DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/torneos/activo', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM torneos WHERE activo = true LIMIT 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No hay ningún torneo activo' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/torneos', async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }
        const result = await pool.query(
            'INSERT INTO torneos (nombre) VALUES ($1) RETURNING *',
            [nombre]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un torneo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

app.put('/api/torneos/desactivar-todos', async (req, res) => {
    try {
        await pool.query('UPDATE torneos SET activo = false');
        res.json({ message: 'Todos los torneos han sido desactivados.' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/torneos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre } = req.body;
        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }
        const result = await pool.query(
            'UPDATE torneos SET nombre = $1 WHERE id = $2 RETURNING *',
            [nombre, id]
        );
         if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un torneo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

app.delete('/api/torneos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const torneo = await pool.query('SELECT * FROM torneos WHERE id = $1', [id]);
        if (torneo.rows.length > 0 && torneo.rows[0].activo) {
            return res.status(400).json({ error: 'No se puede eliminar un torneo activo.' });
        }
        const result = await pool.query('DELETE FROM torneos WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }
        res.json({ message: 'Torneo eliminado correctamente' });
    } catch (error) {
        if (error.code === '23503') {
             return res.status(400).json({ error: 'No se puede eliminar. Hay estadísticas asociadas a este torneo.' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== EQUIPOS ======================
app.get('/api/equipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM equipos ORDER BY id');
        res.json(result.rows);
    } catch (error) {
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/equipos', async (req, res) => {
    try {
        const { nombre, manager, ciudad } = req.body;
        if (!nombre || !manager || !ciudad) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }
        const result = await pool.query(
            'INSERT INTO equipos (nombre, manager, ciudad, fecha_creacion) VALUES ($1, $2, $3, NOW()) RETURNING *',
            [nombre, manager, ciudad]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un equipo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

app.put('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, manager, ciudad } = req.body;
        if (!nombre || !manager || !ciudad) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }
        const result = await pool.query(
            'UPDATE equipos SET nombre = $1, manager = $2, ciudad = $3 WHERE id = $4 RETURNING *',
            [nombre, manager, ciudad, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'Ya existe un equipo con ese nombre' });
        } else {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

app.delete('/api/equipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM equipos WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }
        res.json({ message: 'Equipo eliminado correctamente' });
    } catch (error) {
        if (error.code === '23503') {
            return res.status(400).json({ error: 'No se puede eliminar. Hay jugadores o partidos asociados.' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== JUGADORES ======================
app.get('/api/jugadores', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT j.*, e.nombre as equipo_nombre
            FROM jugadores j
            LEFT JOIN equipos e ON j.equipo_id = e.id
            ORDER BY j.equipo_id, j.nombre
        `);
        res.json(result.rows);
    } catch (error) {
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
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/jugadores', async (req, res) => {
    try {
        const { nombre, equipo_id, posicion, numero } = req.body;
        if (!nombre || !equipo_id) {
            return res.status(400).json({ error: 'Nombre y equipo son requeridos' });
        }
        const result = await pool.query(
            'INSERT INTO jugadores (nombre, equipo_id, posicion, numero) VALUES ($1, $2, $3, $4) RETURNING *',
            [nombre, equipo_id, posicion || null, numero || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, equipo_id, posicion, numero } = req.body;
        if (!nombre || !equipo_id) {
            return res.status(400).json({ error: 'Nombre y equipo son requeridos' });
        }
        const result = await pool.query(
            'UPDATE jugadores SET nombre = $1, equipo_id = $2, posicion = $3, numero = $4 WHERE id = $5 RETURNING *',
            [nombre, equipo_id, posicion || null, numero || null, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/jugadores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM jugadores WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        res.json({ message: 'Jugador eliminado correctamente' });
    } catch (error) {
        if (error.code === '23503') {
            return res.status(400).json({ error: 'No se puede eliminar. El jugador tiene estadísticas asociadas.' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== PARTIDOS ======================
app.get('/api/partidos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, 
                   el.nombre as equipo_local_nombre,
                   ev.nombre as equipo_visitante_nombre
            FROM partidos p
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            ORDER BY p.fecha_partido DESC
        `);
        res.json(result.rows);
    } catch (error) {
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
            JOIN equipos el ON p.equipo_local_id = el.id
            JOIN equipos ev ON p.equipo_visitante_id = ev.id
            WHERE p.id = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/partidos', async (req, res) => {
    try {
        const { equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido } = req.body;
        
        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ error: 'Equipo local, equipo visitante y fecha son requeridos' });
        }
        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ error: 'Los equipos local y visitante deben ser diferentes' });
        }
        
        const result = await pool.query(
            'INSERT INTO partidos (equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [equipo_local_id, equipo_visitante_id, carreras_local || null, carreras_visitante || null, innings_jugados || 9, fecha_partido]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { equipo_local_id, equipo_visitante_id, carreras_local, carreras_visitante, innings_jugados, fecha_partido } = req.body;
        
        if (!equipo_local_id || !equipo_visitante_id || !fecha_partido) {
            return res.status(400).json({ error: 'Equipo local, visitante y fecha son obligatorios' });
        }
        if (equipo_local_id === equipo_visitante_id) {
            return res.status(400).json({ error: 'Los equipos local y visitante deben ser diferentes' });
        }
        
        const result = await pool.query(
            'UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2, carreras_local = $3, carreras_visitante = $4, innings_jugados = $5, fecha_partido = $6 WHERE id = $7 RETURNING *',
            [equipo_local_id, equipo_visitante_id, carreras_local === '' ? null : carreras_local, carreras_visitante === '' ? null : carreras_visitante, innings_jugados || 9, fecha_partido, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/partidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM partidos WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }
        res.json({ message: 'Partido eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ====================== ESTADÍSTICAS OFENSIVAS ======================
app.get('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT eo.*, j.nombre as jugador_nombre, j.posicion, e.nombre as equipo_nombre
            FROM estadisticas_ofensivas eo
            JOIN jugadores j ON eo.jugador_id = j.id
            JOIN equipos e ON j.equipo_id = e.id
            ORDER BY eo.temporada DESC, eo.id
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const {
            jugador_id, at_bats, hits, home_runs, rbi, 
            runs, walks, stolen_bases, temporada
        } = req.body;
        if (!jugador_id || !temporada) {
            return res.status(400).json({ error: 'Jugador y temporada son requeridos' });
        }
        const existing = await pool.query(
            'SELECT id FROM estadisticas_ofensivas WHERE jugador_id = $1 AND temporada = $2',
            [jugador_id, temporada]
        );

        let result;
        if (existing.rows.length > 0) {
            result = await pool.query(`
                UPDATE estadisticas_ofensivas SET
                    at_bats = at_bats + $1, hits = hits + $2, home_runs = home_runs + $3, rbi = rbi + $4,
                    runs = runs + $5, walks = walks + $6, stolen_bases = stolen_bases + $7
                WHERE id = $8 RETURNING *
            `, [at_bats || 0, hits || 0, home_runs || 0, rbi || 0, runs || 0, walks || 0, stolen_bases || 0, existing.rows[0].id]);
        } else {
            result = await pool.query(`
                INSERT INTO estadisticas_ofensivas (jugador_id, temporada, at_bats, hits, home_runs, rbi, runs, walks, stolen_bases)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
            `, [jugador_id, temporada, at_bats || 0, hits || 0, home_runs || 0, rbi || 0, runs || 0, walks || 0, stolen_bases || 0]);
        }
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});

app.put('/api/estadisticas-ofensivas', async (req, res) => {
    try {
        const { jugador_id, temporada, at_bats, hits, home_runs, rbi, runs, walks, stolen_bases } = req.body;
        if (!jugador_id || !temporada) {
            return res.status(400).json({ error: 'Jugador y temporada son requeridos' });
        }
        const result = await pool.query(`
            UPDATE estadisticas_ofensivas SET
                at_bats = $1, hits = $2, home_runs = $3, rbi = $4,
                runs = $5, walks = $6, stolen_bases = $7
            WHERE jugador_id = $8 AND temporada = $9 RETURNING *
        `, [at_bats || 0, hits || 0, home_runs || 0, rbi || 0, runs || 0, walks || 0, stolen_bases || 0, jugador_id, temporada]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Estadísticas no encontradas para ese jugador y temporada.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
    }
});

// ... (El resto de las rutas de estadísticas y líderes se mantiene igual)


// =================================================================
// ====================== RUTAS DE ARCHIVOS HTML ===================
// =================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});
app.get('/public', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/public.html'));
});

// =================================================================
// ====================== INICIAR SERVIDOR =========================
// =================================================================

app.listen(PORT, async () => {
    console.log(`🚀 Servidor Chogui League corriendo en puerto ${PORT}`);
    
    // Ejecutar la inicialización de la base de datos
    await inicializarBaseDeDatos();
    
    console.log(`✅ Servidor listo para recibir conexiones.`);
});

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

// ====================== EQUIPOS ======================
app.get('/api/equipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM equipos ORDER BY id');
        res.json(result.rows);
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


// ... (Aquí irían el resto de tus rutas para PARTIDOS, ESTADÍSTICAS, etc. que podemos añadir después)
// Por ahora, nos enfocamos en que el login y las tablas básicas funcionen.


// =================================================================
// ====================== INICIAR SERVIDOR =========================
// =================================================================

app.listen(PORT, async () => {
    console.log(`🚀 Servidor Chogui League corriendo en puerto ${PORT}`);
    
    // Ejecutar la inicialización de la base de datos
    await inicializarBaseDeDatos();
    
    console.log(`✅ Servidor listo para recibir conexiones.`);
});


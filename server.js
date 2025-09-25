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

// Función para ejecutar migraciones de base de datos
async function runMigrations() {
    const fs = require('fs');
    
    const runSqlFile = async (fileName) => {
        try {
            const sqlPath = path.join(__dirname, fileName);
            if (fs.existsSync(sqlPath)) {
                const sql = fs.readFileSync(sqlPath, 'utf8');
                await pool.query(sql);
                console.log(`✅ Migración ${fileName} ejecutada correctamente`);
                
                const executedPath = path.join(__dirname, fileName.replace('.sql', '.executed.sql'));
                fs.renameSync(sqlPath, executedPath);
            }
        } catch (error) {
            console.error(`❌ Error ejecutando migración ${fileName}:`, error.message);
        }
    };
    
    await runSqlFile('init-db.sql');
    await runSqlFile('setup-pitching-stats.sql');
    await runSqlFile('setup-offensive-stats.sql');
    await runSqlFile('setup-tournaments.sql');
    await runSqlFile('fix-temporada-length.sql'); 

    console.log('📄 Verificación de migraciones completada.');
}

// ▼▼▼▼▼ NUEVA FUNCIÓN DE SEGURIDAD ▼▼▼▼▼
async function asegurarAdmin() {
    try {
        const adminUsername = 'admin';
        const adminPassword = 'admin'; // La contraseña en texto plano
        
        // Hashear la contraseña
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        // Query para insertar o actualizar el usuario admin
        const query = `
            INSERT INTO usuarios (username, password, role) 
            VALUES ($1, $2, 'admin') 
            ON CONFLICT (username) 
            DO UPDATE SET password = $2;
        `;
        
        await pool.query(query, [adminUsername, hashedPassword]);
        console.log('✅ Usuario administrador asegurado/actualizado correctamente.');

    } catch (error) {
        // Ignorar el error si la tabla 'usuarios' aún no existe durante la primera migración
        if (error.code === '42P01') {
            console.log('Tabla "usuarios" no encontrada, se creará en la migración. Se reintentará al próximo inicio.');
        } else {
            console.error('❌ Error asegurando el usuario administrador:', error);
        }
    }
}
// ▲▲▲▲▲ FIN DE LA NUEVA FUNCIÓN ▲▲▲▲▲

// ... (El resto de tus rutas de API se mantiene igual)

// =================================================================
// ====================== RUTAS DE LA API ==========================
// =================================================================

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

// ... (Aquí irían todas tus otras rutas: /api/equipos, /api/jugadores, etc. Las he omitido por brevedad pero deben estar en tu archivo)

// =================================================================
// ====================== INICIAR SERVIDOR =========================
// =================================================================

app.listen(PORT, async () => { // <--- Añadido 'async'
    console.log(`🚀 Servidor Chogui League corriendo en puerto ${PORT}`);
    
    // Ejecutar migraciones
    await runMigrations();
    
    // ▼▼▼▼▼ LLAMADA A LA NUEVA FUNCIÓN DE SEGURIDAD ▼▼▼▼▼
    await asegurarAdmin(); 
    // ▲▲▲▲▲ FIN DE LA LLAMADA ▲▲▲▲▲

    console.log('✅ Servidor listo para recibir conexiones.');
});

const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./config/environment');
const corsOptions = require('./config/cors');
const pool = require('./config/database');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// Servir archivos estaticos
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as time');
        res.json({
            success: true,
            status: 'ok',
            timestamp: result.rows[0].time,
            environment: config.nodeEnv
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            status: 'error',
            error: err.message
        });
    }
});

// Rutas API (se agregaran en Parte 2/3)
// TODO: require('./routes/torneos.routes')
// TODO: require('./routes/equipos.routes')
// TODO: require('./routes/jugadores.routes')
// TODO: require('./routes/partidos.routes')
// TODO: require('./routes/estadisticas.routes')
// TODO: require('./routes/dashboard.routes')

// Ruta raiz - servir frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler (debe ir al final)
app.use(errorHandler);

// Iniciar servidor
const PORT = config.port;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📦 Entorno: ${config.nodeEnv}`);
});

module.exports = app;

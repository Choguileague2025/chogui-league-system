require('dotenv').config();

const config = {
    port: process.env.PORT || 8080,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV || 'development',
    activeSeason: process.env.ACTIVE_SEASON || '2026',
};

// Validar variables criticas
if (!config.databaseUrl) {
    throw new Error('DATABASE_URL no esta definida');
}

module.exports = config;

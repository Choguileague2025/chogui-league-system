require('dotenv').config();

function parseOrigins(value) {
    if (!value) {
        return [
            'http://localhost:8080',
            'http://127.0.0.1:8080',
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ];
    }

    return value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

const config = {
    port: process.env.PORT || 8080,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV || 'development',
    activeSeason: process.env.ACTIVE_SEASON || '2026',
    authCookieName: process.env.AUTH_COOKIE_NAME || 'chogui_session',
    csrfCookieName: process.env.CSRF_COOKIE_NAME || 'chogui_csrf',
    allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
};

// Validar variables criticas
if (!config.databaseUrl) {
    throw new Error('DATABASE_URL no esta definida');
}

if (!config.jwtSecret) {
    throw new Error('JWT_SECRET no esta definida');
}

module.exports = config;

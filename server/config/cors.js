const config = require('./environment');
const { securityLog } = require('../utils/securityLogger');

const allowedOrigins = new Set(config.allowedOrigins);

const corsOptions = {
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        securityLog('warn', 'CORS_REJECTED', { origin });
        return callback(new Error('Origen no permitido por la politica CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
};

module.exports = corsOptions;

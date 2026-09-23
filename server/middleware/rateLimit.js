const rateLimit = require('express-rate-limit');
const { securityLog } = require('../utils/securityLogger');

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// El panel administrativo realiza muchas escrituras legitimas durante la carga
// de planteles, calendarios y boxscores. El limite sigue frenando automatizaciones
// abusivas, pero ya no bloquea al operador despues de apenas diez registros.
const ADMIN_RATE_LIMIT_MAX = positiveInteger(process.env.ADMIN_RATE_LIMIT_MAX, 300);
const ADMIN_RATE_LIMIT_WINDOW_MS = positiveInteger(
    process.env.ADMIN_RATE_LIMIT_WINDOW_MS,
    FIFTEEN_MINUTES_MS
);

function logRateLimitHit(req, limitName) {
    securityLog('warn', 'RATE_LIMIT', {
        limit: limitName,
        ip: req.ip,
        method: req.method,
        path: req.originalUrl
    });
}

function buildLimiter({ windowMs, max, message, limitName }) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logRateLimitHit(req, limitName);
            return res.status(429).json({
                success: false,
                message
            });
        }
    });
}

const apiLimiter = buildLimiter({
    windowMs: FIFTEEN_MINUTES_MS,
    // The public dashboard loads several views and team crests in parallel.
    // Authentication and admin writes keep their stricter separate limiters.
    max: 300,
    limitName: 'api_general',
    message: 'Demasiadas peticiones. Intenta de nuevo en 15 minutos.'
});

const authLimiter = buildLimiter({
    windowMs: FIFTEEN_MINUTES_MS,
    max: 5,
    limitName: 'auth',
    message: 'Demasiados intentos de autenticacion. Intenta de nuevo en 15 minutos.'
});

const adminLimiter = buildLimiter({
    windowMs: ADMIN_RATE_LIMIT_WINDOW_MS,
    max: ADMIN_RATE_LIMIT_MAX,
    limitName: 'admin_sensitive',
    message: 'Se alcanzo temporalmente el limite de operaciones administrativas. Intenta nuevamente en unos minutos.'
});

module.exports = {
    apiLimiter,
    authLimiter,
    adminLimiter,
    ADMIN_RATE_LIMIT_MAX,
    ADMIN_RATE_LIMIT_WINDOW_MS
};

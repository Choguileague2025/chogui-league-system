const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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
const AUTH_RATE_LIMIT_MAX = positiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 50);

function loginAttemptKey(req) {
    const username = typeof req.body?.username === 'string'
        ? req.body.username.trim().toLowerCase().slice(0, 50)
        : 'sin-usuario';

    return `${ipKeyGenerator(req.ip)}:${username || 'sin-usuario'}`;
}

function logRateLimitHit(req, limitName) {
    securityLog('warn', 'RATE_LIMIT', {
        limit: limitName,
        ip: req.ip,
        method: req.method,
        path: req.originalUrl
    });
}

function buildLimiter({ windowMs, max, message, limitName, ...options }) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        ...options,
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
    // Las operaciones correctas son trabajo normal y no deben consumir cupo.
    // Solo una sucesion de respuestas fallidas activa la proteccion.
    skipSuccessfulRequests: true,
    limitName: 'api_general',
    message: 'Demasiadas peticiones. Intenta de nuevo en 15 minutos.'
});

const authLimiter = buildLimiter({
    windowMs: FIFTEEN_MINUTES_MS,
    max: AUTH_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    keyGenerator: loginAttemptKey,
    limitName: 'auth',
    message: 'Demasiados intentos de autenticacion. Intenta de nuevo en 15 minutos.'
});

const adminLimiter = buildLimiter({
    windowMs: ADMIN_RATE_LIMIT_WINDOW_MS,
    max: ADMIN_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    limitName: 'admin_sensitive',
    message: 'Se alcanzo temporalmente el limite de operaciones administrativas. Intenta nuevamente en unos minutos.'
});

module.exports = {
    apiLimiter,
    authLimiter,
    adminLimiter,
    ADMIN_RATE_LIMIT_MAX,
    ADMIN_RATE_LIMIT_WINDOW_MS,
    AUTH_RATE_LIMIT_MAX
};

const rateLimit = require('express-rate-limit');
const { securityLog } = require('../utils/securityLogger');

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
    windowMs: 15 * 60 * 1000,
    max: 100,
    limitName: 'api_general',
    message: 'Demasiadas peticiones. Intenta de nuevo en 15 minutos.'
});

const authLimiter = buildLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    limitName: 'auth',
    message: 'Demasiados intentos de autenticacion. Intenta de nuevo en 15 minutos.'
});

const adminLimiter = buildLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    limitName: 'admin_sensitive',
    message: 'Demasiadas acciones sensibles. Intenta de nuevo en 15 minutos.'
});

module.exports = {
    apiLimiter,
    authLimiter,
    adminLimiter
};

const crypto = require('crypto');
const config = require('../config/environment');
const { securityLog } = require('../utils/securityLogger');

function getCsrfCookieOptions() {
    return {
        httpOnly: false,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        path: '/'
    };
}

function issueCsrfToken(res) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(config.csrfCookieName, token, getCsrfCookieOptions());
    return token;
}

function requireCsrf(req, res, next) {
    const cookieToken = req.cookies?.[config.csrfCookieName];
    const headerToken = req.get('X-CSRF-Token');

    if (!cookieToken || !headerToken) {
        securityLog('warn', 'CSRF_MISSING', {
            ip: req.ip,
            method: req.method,
            path: req.originalUrl
        });
        return res.status(403).json({
            success: false,
            message: 'Token CSRF requerido'
        });
    }

    const cookieBuffer = Buffer.from(String(cookieToken));
    const headerBuffer = Buffer.from(String(headerToken));

    if (
        cookieBuffer.length !== headerBuffer.length ||
        !crypto.timingSafeEqual(cookieBuffer, headerBuffer)
    ) {
        securityLog('warn', 'CSRF_INVALID', {
            ip: req.ip,
            method: req.method,
            path: req.originalUrl
        });
        return res.status(403).json({
            success: false,
            message: 'Token CSRF invalido'
        });
    }

    return next();
}

module.exports = {
    issueCsrfToken,
    requireCsrf
};

const config = require('../config/environment');
const { verifyToken } = require('../utils/token');
const { securityLog } = require('../utils/securityLogger');

function getTokenFromRequest(req) {
    const authHeader = req.get('Authorization') || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme === 'Bearer' && token) {
        return token;
    }

    return req.cookies?.[config.authCookieName] || null;
}

function requireAuth(req, res, next) {
    const token = getTokenFromRequest(req);

    if (!token) {
        securityLog('warn', 'AUTH_MISSING', {
            ip: req.ip,
            method: req.method,
            path: req.originalUrl
        });
        return res.status(401).json({
            success: false,
            message: 'Autenticacion requerida'
        });
    }

    try {
        req.user = verifyToken(token, config.jwtSecret);
        return next();
    } catch (error) {
        securityLog('warn', 'AUTH_INVALID', {
            ip: req.ip,
            method: req.method,
            path: req.originalUrl,
            reason: error.message
        });
        return res.status(401).json({
            success: false,
            message: 'Sesion invalida o expirada'
        });
    }
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Permisos de administrador requeridos'
            });
        }

        return next();
    });
}

module.exports = {
    requireAuth,
    requireAdmin
};

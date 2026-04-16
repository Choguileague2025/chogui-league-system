const config = require('../config/environment');
const { verifyToken } = require('../utils/token');

function requireAuth(req, res, next) {
    const authHeader = req.get('Authorization') || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({
            success: false,
            message: 'Autenticacion requerida'
        });
    }

    try {
        req.user = verifyToken(token, config.jwtSecret);
        return next();
    } catch (error) {
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

const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const config = require('../config/environment');
const { signToken } = require('../utils/token');
const { issueCsrfToken } = require('../middleware/csrf');
const { securityLog } = require('../utils/securityLogger');

function getAuthCookieOptions() {
    return {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 1000 * 60 * 60 * 8
    };
}

function clearSessionCookies(res) {
    res.clearCookie(config.authCookieName, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        path: '/'
    });
    res.clearCookie(config.csrfCookieName, {
        httpOnly: false,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        path: '/'
    });
}

// POST /api/login
async function login(req, res, next) {
    try {
        const { username, password } = req.body;
        const normalizedUsername = typeof username === 'string' ? username.trim() : '';

        if (!normalizedUsername || !password) {
            securityLog('warn', 'AUTH_LOGIN_REJECTED', {
                ip: req.ip,
                reason: 'missing_credentials'
            });
            return res.status(400).json({
                success: false,
                message: 'Usuario y contraseña son requeridos'
            });
        }

        if (normalizedUsername.length > 50 || password.length > 100) {
            securityLog('warn', 'AUTH_LOGIN_REJECTED', {
                ip: req.ip,
                reason: 'invalid_length'
            });
            return res.status(400).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        const userResult = await pool.query(
            'SELECT * FROM usuarios WHERE username = $1',
            [normalizedUsername]
        );

        if (userResult.rows.length === 0) {
            securityLog('warn', 'AUTH_LOGIN_FAILED', {
                ip: req.ip,
                username: normalizedUsername,
                reason: 'unknown_user'
            });
            return res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            const token = signToken({
                username: user.username,
                role: user.role
            }, config.jwtSecret);
            const csrfToken = issueCsrfToken(res);
            res.cookie(config.authCookieName, token, getAuthCookieOptions());

            return res.json({
                success: true,
                message: 'Login exitoso',
                csrfToken,
                user: {
                    username: user.username,
                    role: user.role
                }
            });
        } else {
            securityLog('warn', 'AUTH_LOGIN_FAILED', {
                ip: req.ip,
                username: normalizedUsername,
                reason: 'invalid_password'
            });
            return res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
        }
    } catch (error) {
        return next(error);
    }
}

function csrfToken(req, res) {
    const token = issueCsrfToken(res);
    return res.json({
        success: true,
        csrfToken: token
    });
}

function session(req, res) {
    return res.json({
        success: true,
        authenticated: true,
        user: {
            username: req.user.username,
            role: req.user.role
        }
    });
}

function logout(req, res) {
    clearSessionCookies(res);
    return res.json({
        success: true,
        message: 'Sesion cerrada correctamente'
    });
}

module.exports = {
    login,
    csrfToken,
    session,
    logout
};

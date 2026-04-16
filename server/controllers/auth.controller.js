const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const config = require('../config/environment');
const { signToken } = require('../utils/token');

// POST /api/login
async function login(req, res, next) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Usuario y contraseña son requeridos'
            });
        }

        if (username.length > 50 || password.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        const userResult = await pool.query(
            'SELECT * FROM usuarios WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
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

            res.json({
                success: true,
                message: 'Login exitoso',
                token,
                user: {
                    username: user.username,
                    role: user.role
                }
            });
        } else {
            return res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
        }
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
}

module.exports = {
    login
};

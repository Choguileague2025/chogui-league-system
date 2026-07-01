const { securityLog } = require('../utils/securityLogger');

function errorHandler(err, req, res, next) {
    securityLog('error', 'REQUEST_ERROR', {
        request_id: req.requestId,
        ip: req.ip,
        method: req.method,
        path: req.originalUrl,
        status: err.statusCode || 500,
        error: err.message || 'Error interno del servidor'
    });

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Error interno del servidor';

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

module.exports = errorHandler;

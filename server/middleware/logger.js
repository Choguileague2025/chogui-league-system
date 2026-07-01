const crypto = require('crypto');

function logger(req, res, next) {
    const timestamp = new Date().toISOString();
    const requestId = crypto.randomUUID();
    const start = Date.now();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
        const durationMs = Date.now() - start;
        console.log(
            `[${timestamp}] id=${requestId} ip=${req.ip} ${req.method} ${req.originalUrl} status=${res.statusCode} duration_ms=${durationMs}`
        );
    });

    next();
}

module.exports = logger;

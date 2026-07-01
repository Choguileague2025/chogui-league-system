const { securityLog } = require('../utils/securityLogger');

function logValidationFailure(req, issues) {
    securityLog('warn', 'VALIDATION_REJECTED', {
        ip: req.ip,
        method: req.method,
        path: req.originalUrl,
        issues: issues.join(' | ')
    });
}

function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            const issues = result.error.issues.map((issue) => {
                const path = issue.path.length ? issue.path.join('.') : 'body';
                return `${path}: ${issue.message}`;
            });
            logValidationFailure(req, issues);
            return res.status(400).json({
                success: false,
                message: 'Entrada invalida',
                errors: issues
            });
        }

        req.body = result.data;
        return next();
    };
}

module.exports = {
    validateBody
};

function formatMeta(meta = {}) {
    return Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ');
}

function securityLog(level, event, meta = {}) {
    const timestamp = new Date().toISOString();
    const payload = formatMeta(meta);
    const message = `[${timestamp}] [SECURITY] [${event}]${payload ? ` ${payload}` : ''}`;

    if (level === 'error') {
        console.error(message);
        return;
    }

    if (level === 'warn') {
        console.warn(message);
        return;
    }

    console.log(message);
}

module.exports = {
    securityLog
};

const crypto = require('crypto');

function base64UrlEncode(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - normalized.length % 4) % 4);
    return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function signPart(input, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(input)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function signToken(payload, secret, options = {}) {
    if (!secret) {
        throw new Error('JWT_SECRET no esta definido');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = options.expiresIn || 60 * 60 * 8;
    const header = { alg: 'HS256', typ: 'JWT' };
    const tokenPayload = {
        ...payload,
        iat: now,
        exp: now + expiresIn
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
    const signature = signPart(`${encodedHeader}.${encodedPayload}`, secret);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token, secret) {
    if (!secret) {
        throw new Error('JWT_SECRET no esta definido');
    }

    const parts = String(token || '').split('.');
    if (parts.length !== 3) {
        throw new Error('Token invalido');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = signPart(`${encodedHeader}.${encodedPayload}`, secret);

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
        signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
        throw new Error('Firma invalida');
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
        throw new Error('Token expirado');
    }

    return payload;
}

module.exports = {
    signToken,
    verifyToken
};

const express = require('express');
const request = require('supertest');

describe('limite de operaciones administrativas', () => {
    const originalMax = process.env.ADMIN_RATE_LIMIT_MAX;
    const originalWindow = process.env.ADMIN_RATE_LIMIT_WINDOW_MS;

    afterEach(() => {
        if (originalMax === undefined) delete process.env.ADMIN_RATE_LIMIT_MAX;
        else process.env.ADMIN_RATE_LIMIT_MAX = originalMax;

        if (originalWindow === undefined) delete process.env.ADMIN_RATE_LIMIT_WINDOW_MS;
        else process.env.ADMIN_RATE_LIMIT_WINDOW_MS = originalWindow;

        jest.resetModules();
    });

    test('permite el volumen configurado y bloquea el siguiente intento', async () => {
        process.env.ADMIN_RATE_LIMIT_MAX = '3';
        process.env.ADMIN_RATE_LIMIT_WINDOW_MS = '60000';
        jest.resetModules();

        const { adminLimiter } = require('../../server/middleware/rateLimit');
        const app = express();
        app.post('/admin-write', adminLimiter, (_req, res) => res.status(201).json({ success: true }));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        for (let attempt = 0; attempt < 3; attempt += 1) {
            await request(app).post('/admin-write').expect(201);
        }

        const blocked = await request(app).post('/admin-write').expect(429);
        expect(blocked.body).toEqual(expect.objectContaining({
            success: false,
            message: expect.stringContaining('limite de operaciones administrativas')
        }));
        expect(blocked.headers['ratelimit-limit']).toBe('3');
        expect(blocked.headers).toHaveProperty('retry-after');
        warn.mockRestore();
    });

    test('usa un limite operativo de 300 acciones por defecto', () => {
        delete process.env.ADMIN_RATE_LIMIT_MAX;
        delete process.env.ADMIN_RATE_LIMIT_WINDOW_MS;
        jest.resetModules();

        const limits = require('../../server/middleware/rateLimit');
        expect(limits.ADMIN_RATE_LIMIT_MAX).toBe(300);
        expect(limits.ADMIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
    });
});

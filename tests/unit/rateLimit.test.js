const express = require('express');
const request = require('supertest');

describe('limites de uso del sistema', () => {
    const originalAdminMax = process.env.ADMIN_RATE_LIMIT_MAX;
    const originalAdminWindow = process.env.ADMIN_RATE_LIMIT_WINDOW_MS;
    const originalAuthMax = process.env.AUTH_RATE_LIMIT_MAX;

    afterEach(() => {
        if (originalAdminMax === undefined) delete process.env.ADMIN_RATE_LIMIT_MAX;
        else process.env.ADMIN_RATE_LIMIT_MAX = originalAdminMax;

        if (originalAdminWindow === undefined) delete process.env.ADMIN_RATE_LIMIT_WINDOW_MS;
        else process.env.ADMIN_RATE_LIMIT_WINDOW_MS = originalAdminWindow;

        if (originalAuthMax === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
        else process.env.AUTH_RATE_LIMIT_MAX = originalAuthMax;

        jest.restoreAllMocks();
        jest.resetModules();
    });

    test('las operaciones administrativas exitosas no consumen el limite', async () => {
        process.env.ADMIN_RATE_LIMIT_MAX = '1';
        process.env.ADMIN_RATE_LIMIT_WINDOW_MS = '60000';
        jest.resetModules();

        const { adminLimiter } = require('../../server/middleware/rateLimit');
        const app = express();
        app.post('/admin-write', adminLimiter, (_req, res) => res.status(201).json({ success: true }));
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await request(app).post('/admin-write').expect(201);
        }
    });

    test('los errores administrativos repetidos siguen protegidos', async () => {
        process.env.ADMIN_RATE_LIMIT_MAX = '2';
        process.env.ADMIN_RATE_LIMIT_WINDOW_MS = '60000';
        jest.resetModules();

        const { adminLimiter } = require('../../server/middleware/rateLimit');
        const app = express();
        app.post('/admin-write', adminLimiter, (_req, res) => res.status(400).json({ success: false }));
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        await request(app).post('/admin-write').expect(400);
        await request(app).post('/admin-write').expect(400);
        const blocked = await request(app).post('/admin-write').expect(429);

        expect(blocked.body.message).toContain('limite de operaciones administrativas');
        expect(blocked.headers['ratelimit-limit']).toBe('2');
        expect(blocked.headers).toHaveProperty('retry-after');
    });

    test('el login no acumula accesos correctos y separa los usuarios', async () => {
        process.env.AUTH_RATE_LIMIT_MAX = '1';
        jest.resetModules();

        const { authLimiter } = require('../../server/middleware/rateLimit');
        const app = express();
        app.use(express.json());
        app.post('/login', authLimiter, (req, res) => {
            if (req.body.password === 'correcta') return res.json({ success: true });
            return res.status(401).json({ success: false });
        });
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        for (let attempt = 0; attempt < 3; attempt += 1) {
            await request(app)
                .post('/login')
                .send({ username: 'admin', password: 'correcta' })
                .expect(200);
        }

        await request(app).post('/login').send({ username: 'operador-a', password: 'mal' }).expect(401);
        await request(app).post('/login').send({ username: 'operador-a', password: 'mal' }).expect(429);
        await request(app).post('/login').send({ username: 'operador-b', password: 'mal' }).expect(401);
    });

    test('mantiene umbrales amplios y configurables por defecto', () => {
        delete process.env.ADMIN_RATE_LIMIT_MAX;
        delete process.env.ADMIN_RATE_LIMIT_WINDOW_MS;
        delete process.env.AUTH_RATE_LIMIT_MAX;
        jest.resetModules();

        const limits = require('../../server/middleware/rateLimit');
        expect(limits.ADMIN_RATE_LIMIT_MAX).toBe(300);
        expect(limits.ADMIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
        expect(limits.AUTH_RATE_LIMIT_MAX).toBe(50);
    });
});

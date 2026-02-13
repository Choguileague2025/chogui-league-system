/**
 * Tests de integración para las APIs principales
 * Estos tests requieren conexión a la base de datos
 */

const request = require('supertest');
const app = require('../../server/index');

// =============================================
// HEALTH CHECK
// =============================================

describe('Health Check', () => {
    test('GET /api/health - debe retornar status ok', async () => {
        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.status).toBe('ok');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('environment');
    });
});

// =============================================
// SSE ENDPOINTS
// =============================================

describe('SSE API', () => {
    test('GET /api/sse/status - debe retornar estado del servicio', async () => {
        const response = await request(app).get('/api/sse/status');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('active', true);
        expect(response.body).toHaveProperty('clients_connected');
        expect(typeof response.body.clients_connected).toBe('number');
        expect(response.body).toHaveProperty('timestamp');
    });
});

// =============================================
// TORNEOS API
// =============================================

describe('Torneos API', () => {
    test('GET /api/torneos - debe obtener todos los torneos', async () => {
        const response = await request(app).get('/api/torneos');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('GET /api/torneos/activo - debe retornar torneo o mensaje', async () => {
        const response = await request(app).get('/api/torneos/activo');

        // Puede ser 200 (torneo encontrado) o 404 (sin torneo activo)
        expect([200, 404]).toContain(response.status);

        if (response.status === 200) {
            expect(response.body).toHaveProperty('id');
            expect(response.body).toHaveProperty('nombre');
        }
    });
});

// =============================================
// EQUIPOS API
// =============================================

describe('Equipos API', () => {
    test('GET /api/equipos - debe obtener todos los equipos', async () => {
        const response = await request(app).get('/api/equipos');

        expect(response.status).toBe(200);
        // Response could be an array or object with equipos property
        const equipos = Array.isArray(response.body) ? response.body : response.body.equipos;
        expect(Array.isArray(equipos)).toBe(true);
    });

    test('GET /api/equipos/999999 - debe retornar 404 para equipo inexistente', async () => {
        const response = await request(app).get('/api/equipos/999999');

        expect(response.status).toBe(404);
    });
});

// =============================================
// JUGADORES API
// =============================================

describe('Jugadores API', () => {
    test('GET /api/jugadores - debe obtener jugadores', async () => {
        const response = await request(app).get('/api/jugadores');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('jugadores');
        expect(Array.isArray(response.body.jugadores)).toBe(true);
        expect(response.body).toHaveProperty('pagination');
    });

    test('GET /api/jugadores?equipo_id=92 - debe filtrar por equipo', async () => {
        const response = await request(app).get('/api/jugadores?equipo_id=92');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('jugadores');
    });
});

// =============================================
// ESTADÍSTICAS API
// =============================================

describe('Estadísticas API', () => {
    test('GET /api/estadisticas-ofensivas - debe obtener stats ofensivas', async () => {
        const response = await request(app).get('/api/estadisticas-ofensivas');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('GET /api/estadisticas-pitcheo - debe obtener stats de pitcheo', async () => {
        const response = await request(app).get('/api/estadisticas-pitcheo');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('GET /api/estadisticas-defensivas - debe obtener stats defensivas', async () => {
        const response = await request(app).get('/api/estadisticas-defensivas');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('POST /api/estadisticas-ofensivas sin jugador_id - debe rechazar', async () => {
        const response = await request(app)
            .post('/api/estadisticas-ofensivas')
            .send({ at_bats: 10, hits: 5 });

        // Should get 400 for invalid data
        expect([400, 422, 500]).toContain(response.status);
    });
});

// =============================================
// PARTIDOS API
// =============================================

describe('Partidos API', () => {
    test('GET /api/partidos - debe obtener partidos', async () => {
        const response = await request(app).get('/api/partidos');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('partidos');
        expect(Array.isArray(response.body.partidos)).toBe(true);
    });

    test('GET /api/partidos?limit=5 - debe retornar partidos', async () => {
        const response = await request(app).get('/api/partidos?limit=5');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('partidos');
        expect(Array.isArray(response.body.partidos)).toBe(true);
    });
});

// =============================================
// STATIC FILES
// =============================================

describe('Static Files', () => {
    test('GET / - debe servir index.html', async () => {
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.type).toMatch(/html/);
    });

    test('GET /admin - debe servir admin.html', async () => {
        const response = await request(app).get('/admin');

        expect(response.status).toBe(200);
        expect(response.type).toMatch(/html/);
    });

    test('GET /css/optimizations.css - debe servir CSS', async () => {
        const response = await request(app).get('/css/optimizations.css');

        expect(response.status).toBe(200);
        expect(response.type).toMatch(/css/);
    });

    test('GET /js/index_modules.js - debe servir JS', async () => {
        const response = await request(app).get('/js/index_modules.js');

        expect(response.status).toBe(200);
        expect(response.type).toMatch(/javascript/);
    });
});

// =============================================
// LEGACY ALIASES
// =============================================

describe('Legacy Route Aliases', () => {
    test('GET /api/estadisticas_ofensivas - alias con guion bajo', async () => {
        const response = await request(app).get('/api/estadisticas_ofensivas');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });
});

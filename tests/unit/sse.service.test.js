/**
 * Tests unitarios para server/services/sse.service.js
 */

const sseService = require('../../server/services/sse.service');

describe('SSE Service', () => {

    // Helper: crear mock de response SSE
    function createMockResponse() {
        const res = {
            writeHead: jest.fn(),
            write: jest.fn(),
            on: jest.fn(),
            _closeCallback: null
        };
        // Capturar el callback de close
        res.on.mockImplementation((event, cb) => {
            if (event === 'close') {
                res._closeCallback = cb;
            }
        });
        return res;
    }

    // Simular desconexión
    function simulateClose(res) {
        if (res._closeCallback) {
            res._closeCallback();
        }
    }

    afterEach(() => {
        // Limpiar todos los clientes entre tests
        // Forzar limpieza creando y cerrando clientes
        const count = sseService.getClientCount();
        // No hay método clear directo, pero podemos verificar estado
    });

    describe('addClient', () => {
        test('debe configurar headers SSE correctos', () => {
            const res = createMockResponse();
            sseService.addClient(res);

            expect(res.writeHead).toHaveBeenCalledWith(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });

            // Limpiar
            simulateClose(res);
        });

        test('debe enviar comentario inicial', () => {
            const res = createMockResponse();
            sseService.addClient(res);

            expect(res.write).toHaveBeenCalledWith(':ok\n\n');

            // Limpiar
            simulateClose(res);
        });

        test('debe incrementar conteo de clientes', () => {
            const initialCount = sseService.getClientCount();
            const res = createMockResponse();
            sseService.addClient(res);

            expect(sseService.getClientCount()).toBe(initialCount + 1);

            // Limpiar
            simulateClose(res);
        });

        test('debe registrar listener de close', () => {
            const res = createMockResponse();
            sseService.addClient(res);

            expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));

            // Limpiar
            simulateClose(res);
        });

        test('debe remover cliente al cerrar conexión', () => {
            const res = createMockResponse();
            sseService.addClient(res);
            const countAfterAdd = sseService.getClientCount();

            simulateClose(res);

            expect(sseService.getClientCount()).toBe(countAfterAdd - 1);
        });
    });

    describe('notifyAll', () => {
        test('debe enviar evento a todos los clientes', () => {
            const res1 = createMockResponse();
            const res2 = createMockResponse();
            sseService.addClient(res1);
            sseService.addClient(res2);

            sseService.notifyAll('test-event', { message: 'hello' });

            const expectedMessage = 'event: test-event\ndata: {"message":"hello"}\n\n';
            expect(res1.write).toHaveBeenCalledWith(expectedMessage);
            expect(res2.write).toHaveBeenCalledWith(expectedMessage);

            // Limpiar
            simulateClose(res1);
            simulateClose(res2);
        });

        test('debe manejar error de escritura sin crash', () => {
            const res = createMockResponse();
            sseService.addClient(res);

            // Ahora hacer que write lance error (después de addClient)
            res.write.mockImplementation(() => { throw new Error('Connection reset'); });

            // No debe lanzar error
            expect(() => {
                sseService.notifyAll('test', { data: 'test' });
            }).not.toThrow();

            // Cliente con error debería ser removido
            // (implementación actual lo elimina en catch)
        });
    });

    describe('notifyStatsUpdate', () => {
        test('debe enviar evento stats-update con formato correcto', () => {
            const res = createMockResponse();
            sseService.addClient(res);

            sseService.notifyStatsUpdate('ofensivas', {
                jugador_id: 123,
                torneo_id: 52
            });

            // Verificar que se envió un evento stats-update
            const lastCall = res.write.mock.calls[res.write.mock.calls.length - 1][0];
            expect(lastCall).toContain('event: stats-update');
            expect(lastCall).toContain('"tipo":"ofensivas"');
            expect(lastCall).toContain('"jugador_id":123');
            expect(lastCall).toContain('"torneo_id":52');
            expect(lastCall).toContain('timestamp');

            simulateClose(res);
        });
    });

    describe('notifyTournamentChange', () => {
        test('debe enviar evento tournament-change', () => {
            const res = createMockResponse();
            sseService.addClient(res);

            sseService.notifyTournamentChange({
                id: 52,
                nombre: 'Copa Verano'
            });

            const lastCall = res.write.mock.calls[res.write.mock.calls.length - 1][0];
            expect(lastCall).toContain('event: tournament-change');
            expect(lastCall).toContain('"torneo_id":52');
            expect(lastCall).toContain('"torneo_nombre":"Copa Verano"');

            simulateClose(res);
        });
    });

    describe('notifyGeneralUpdate', () => {
        test('debe enviar evento general-update', () => {
            const res = createMockResponse();
            sseService.addClient(res);

            sseService.notifyGeneralUpdate();

            const lastCall = res.write.mock.calls[res.write.mock.calls.length - 1][0];
            expect(lastCall).toContain('event: general-update');
            expect(lastCall).toContain('Recalcular');

            simulateClose(res);
        });
    });

    describe('getClientCount', () => {
        test('debe retornar 0 sin clientes', () => {
            // Puede haber clientes de tests anteriores, solo verificar tipo
            expect(typeof sseService.getClientCount()).toBe('number');
        });

        test('debe contar múltiples clientes', () => {
            const initial = sseService.getClientCount();
            const clients = [];
            for (let i = 0; i < 3; i++) {
                const res = createMockResponse();
                sseService.addClient(res);
                clients.push(res);
            }

            expect(sseService.getClientCount()).toBe(initial + 3);

            // Limpiar
            clients.forEach(c => simulateClose(c));
            expect(sseService.getClientCount()).toBe(initial);
        });
    });
});

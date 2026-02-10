# Sistema SSE (Server-Sent Events) - Chogui League System

## Descripcion

El sistema SSE permite que el servidor envie notificaciones en tiempo real a todos los clientes conectados. Cuando se registran estadisticas o se cambia el torneo activo, todos los usuarios reciben la actualizacion automaticamente.

## Arquitectura

```
Cliente (Browser) ←── SSE Stream ──→ Servidor (Express)
                                        ↓
                     sseService.notifyAll() ← Controllers
```

- **SSE Service** (`server/services/sse.service.js`): Gestiona conexiones y envio de eventos
- **SSE Controller** (`server/controllers/sse.controller.js`): Endpoints HTTP
- **SSE Routes** (`server/routes/sse.routes.js`): Definicion de rutas

## Endpoints

### GET /api/sse/updates

Establece una conexion SSE. Mantiene la conexion HTTP abierta y envia eventos cuando hay cambios.

**Headers de respuesta:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### GET /api/sse/status

Devuelve el estado del servicio SSE.

**Respuesta:**
```json
{
  "active": true,
  "clients_connected": 3,
  "timestamp": "2026-02-10T15:00:00.000Z"
}
```

## Eventos Emitidos

### stats-update

Se emite cuando se registran o actualizan estadisticas (ofensivas, pitcheo, defensivas).

```
event: stats-update
data: {"tipo":"ofensivas","jugador_id":1004,"torneo_id":51,"timestamp":"..."}
```

**Campos:**
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| tipo | string | "ofensivas", "pitcheo", o "defensivas" |
| jugador_id | number | ID del jugador actualizado |
| torneo_id | number | ID del torneo afectado |
| timestamp | string | ISO timestamp del evento |

### tournament-change

Se emite cuando se activa un torneo diferente.

```
event: tournament-change
data: {"torneo_id":52,"torneo_nombre":"Temporada 2024","timestamp":"..."}
```

### general-update

Se emite para notificar una recalculacion general.

```
event: general-update
data: {"message":"Recalcular estadísticas","timestamp":"..."}
```

## Uso desde el Frontend (JavaScript)

### Conexion basica

```javascript
const eventSource = new EventSource('/api/sse/updates');

// Escuchar actualizaciones de stats
eventSource.addEventListener('stats-update', (event) => {
    const data = JSON.parse(event.data);
    console.log('Stats actualizadas:', data.tipo, 'jugador:', data.jugador_id);

    // Recargar tabla de estadisticas
    refreshStatsTable(data.tipo);
});

// Escuchar cambio de torneo
eventSource.addEventListener('tournament-change', (event) => {
    const data = JSON.parse(event.data);
    console.log('Torneo cambiado a:', data.torneo_nombre);

    // Recargar todas las vistas
    refreshAllViews();
});

// Escuchar actualizacion general
eventSource.addEventListener('general-update', (event) => {
    location.reload();
});

// Manejo de errores
eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    // El navegador reconecta automaticamente
};
```

### Reconexion automatica

Los navegadores reconectan automaticamente cuando la conexion SSE se pierde. No se necesita logica adicional de reconexion.

### Cerrar conexion

```javascript
// Cuando el usuario navega fuera o cierra la pagina
eventSource.close();
```

## Integracion con Controllers

Los controllers notifican automaticamente via SSE despues de operaciones exitosas:

- **estadisticas.controller.js**: Notifica `stats-update` despues de cada POST/PUT de ofensivas, pitcheo, defensivas
- **torneos.controller.js**: Notifica `tournament-change` despues de activar un torneo

## API del Servicio SSE

```javascript
const sseService = require('./services/sse.service');

// Agregar cliente SSE
sseService.addClient(res);

// Notificar actualizacion de stats
sseService.notifyStatsUpdate('ofensivas', { jugador_id, torneo_id });

// Notificar cambio de torneo
sseService.notifyTournamentChange({ id: 52, nombre: 'Temporada 2024' });

// Notificar actualizacion general
sseService.notifyGeneralUpdate();

// Obtener clientes conectados
const count = sseService.getClientCount();
```

## Notas Tecnicas

- Las conexiones SSE son unidireccionales (servidor → cliente)
- El servidor mantiene un `Set` de todas las conexiones activas
- Las conexiones se limpian automaticamente cuando el cliente se desconecta
- Los errores de envio a clientes individuales no afectan a otros clientes
- No requiere WebSocket ni dependencias adicionales

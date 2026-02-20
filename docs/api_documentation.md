# API Documentation - Chogui League System

Base URL: `https://your-domain.up.railway.app/api`

## Ejemplos con curl

```bash
# Health check
curl https://your-domain.up.railway.app/api/health

# Obtener torneos
curl https://your-domain.up.railway.app/api/torneos

# Obtener stats ofensivas de un jugador
curl "https://your-domain.up.railway.app/api/estadisticas-ofensivas?jugador_id=1"

# Registrar stats ofensivas (modo sumar)
curl -X POST https://your-domain.up.railway.app/api/estadisticas-ofensivas \
  -H "Content-Type: application/json" \
  -d '{"jugador_id":1,"mode":"sum","at_bats":4,"hits":2,"home_runs":1}'

# Buscar jugadores
curl "https://your-domain.up.railway.app/api/buscar?q=carlos"
```

---

## Autenticacion

### POST /api/login
Autenticar usuario administrador.

**Body:**
```json
{ "username": "admin", "password": "secret" }
```

**Response:** `200 OK`
```json
{ "token": "jwt_token_here" }
```

**curl:**
```bash
curl -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret"}'
```

---

## Torneos

### GET /api/torneos
Obtener todos los torneos.

**curl:** `curl http://localhost:8080/api/torneos`

**Response:** `200 OK`
```json
[
  { "id": 1, "nombre": "Torneo Apertura 2026", "activo": true, "total_juegos": 22, "cupos_playoffs": 6 }
]
```

### GET /api/torneos/activo
Obtener torneo activo actual.

**Response:** `200 OK`
```json
{ "id": 1, "nombre": "Torneo Apertura 2026", "activo": true }
```

### POST /api/torneos
Crear nuevo torneo.

**Body:**
```json
{ "nombre": "Torneo Clausura 2026", "total_juegos": 22, "cupos_playoffs": 6 }
```

### PUT /api/torneos/:id/activar
Activar un torneo (desactiva los demas). Inicializa estadisticas en 0 para todos los jugadores con equipo.

### PUT /api/torneos/:id
Actualizar torneo.

### DELETE /api/torneos/:id
Eliminar torneo (solo si no esta activo). Estadisticas se eliminan en cascada.

### PUT /api/torneos/desactivar-todos
Desactivar todos los torneos.

---

## Equipos

### GET /api/equipos
Obtener todos los equipos.

**Response:** `200 OK`
```json
[
  { "id": 92, "nombre": "Toros del Este", "ciudad": "La Romana", "manager": "Juan Lopez" }
]
```

### GET /api/equipos/:id
Obtener equipo por ID con listado de jugadores.

### GET /api/equipos/:id/detalles
Obtener detalles completos del equipo incluyendo estadisticas colectivas.

### GET /api/equipos/:id/estadisticas/ofensivas
Obtener estadisticas ofensivas de todos los jugadores del equipo.

**Query params:** `torneo_id` (opcional)

### GET /api/equipos/:id/logo
Obtener logo del equipo.

### POST /api/equipos
Crear equipo.

**Body:**
```json
{ "nombre": "Toros del Este", "manager": "Juan Lopez", "ciudad": "La Romana" }
```

**Validacion:** nombre (3-100 chars), manager y ciudad requeridos.

### PUT /api/equipos/:id
Actualizar equipo.

### DELETE /api/equipos/:id
Eliminar equipo.

---

## Jugadores

### GET /api/jugadores
Obtener todos los jugadores con paginacion.

**Query params:**
- `equipo_id` - Filtrar por equipo
- `page` - Pagina (default: 1)
- `limit` - Resultados por pagina (default: 20)

**Response:** `200 OK`
```json
{
  "jugadores": [...],
  "pagination": { "page": 1, "limit": 20, "total": 150 }
}
```

### GET /api/jugadores/:id
Obtener jugador por ID.

### GET /api/jugadores/buscar
Busqueda de jugadores por nombre.

**Query params:** `q` (termino de busqueda, min 2 chars)

### GET /api/jugadores/:id/partidos
Obtener partidos del jugador.

### GET /api/jugadores/:id/similares
Obtener jugadores con estadisticas similares.

### GET /api/jugadores/:id/companeros
Obtener companeros de equipo.

### POST /api/jugadores
Crear jugador.

**Body:**
```json
{ "nombre": "Carlos Gomez", "equipo_id": 92, "posicion": "SS", "numero": 7 }
```

**Posiciones validas:** `C, 1B, 2B, 3B, SS, LF, CF, RF, P, UTIL, DH`

### PUT /api/jugadores/:id
Actualizar jugador.

### DELETE /api/jugadores/:id
Eliminar jugador.

---

## Estadisticas

### Modos de Actualizacion

Todos los endpoints POST/PUT de estadisticas soportan dos modos:

| Modo | Descripcion |
|---|---|
| `sum` (default) | Suma los valores nuevos a los existentes |
| `replace` | Reemplaza los valores existentes |

Incluir `"mode": "sum"` o `"mode": "replace"` en el body.

### Estadisticas Ofensivas

#### GET /api/estadisticas-ofensivas
Obtener estadisticas ofensivas.

**Query params:**
- `torneo_id` - Filtrar por torneo (`todos` para agregar todos)
- `equipo_id` - Filtrar por equipo
- `jugador_id` - Filtrar por jugador
- `min_at_bats` - Minimo de turnos al bate

**Response:** `200 OK`
```json
[
  {
    "jugador_id": 1, "jugador_nombre": "Carlos Gomez",
    "at_bats": 50, "hits": 18, "doubles": 4, "triples": 1,
    "home_runs": 3, "rbi": 12, "runs": 8, "walks": 6,
    "strikeouts": 10, "stolen_bases": 2,
    "avg": "0.360", "obp": "0.411", "slg": "0.580"
  }
]
```

#### POST /api/estadisticas-ofensivas
Crear o actualizar estadisticas ofensivas (upsert).

**Body:**
```json
{
  "jugador_id": 1,
  "torneo_id": 1,
  "mode": "sum",
  "at_bats": 4, "hits": 2, "doubles": 1, "home_runs": 0,
  "rbi": 1, "runs": 1, "walks": 0, "strikeouts": 1,
  "stolen_bases": 0
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Estadisticas ofensivas sumadas correctamente",
  "mode": "sum",
  "data": { ... },
  "previous": { ... }
}
```

### Estadisticas de Pitcheo

#### GET /api/estadisticas-pitcheo
Obtener estadisticas de pitcheo.

**Query params:** `torneo_id`, `equipo_id`, `jugador_id`

#### GET /api/estadisticas-pitcheo/:id
Obtener estadisticas de pitcheo de un jugador.

#### POST /api/estadisticas-pitcheo
Crear estadisticas de pitcheo (upsert con modo sum/replace).

**Body:**
```json
{
  "jugador_id": 5,
  "mode": "sum",
  "innings_pitched": 7, "hits_allowed": 5, "earned_runs": 2,
  "strikeouts": 8, "walks_allowed": 2, "home_runs_allowed": 1,
  "wins": 1, "losses": 0
}
```

#### PUT /api/estadisticas-pitcheo
Actualizar estadisticas de pitcheo.

### Estadisticas Defensivas

#### GET /api/estadisticas-defensivas
Obtener estadisticas defensivas.

#### GET /api/estadisticas-defensivas/:id
Obtener estadisticas defensivas de un jugador.

#### POST /api/estadisticas-defensivas
Crear estadisticas defensivas (upsert con modo sum/replace).

**Body:**
```json
{
  "jugador_id": 1,
  "mode": "sum",
  "putouts": 3, "assists": 2, "errors": 0, "double_plays": 1
}
```

#### PUT /api/estadisticas-defensivas
Actualizar estadisticas defensivas.

---

## Dashboard

### GET /api/dashboard/stats
Obtener conteos generales del sistema.

**Response:** `200 OK`
```json
{ "equipos": 12, "jugadores": 150, "partidos": 45, "jugadores_con_stats": 120 }
```

### GET /api/posiciones
Tabla de posiciones calculada.

**Response:** `200 OK`
```json
[
  {
    "id": 92, "nombre": "Toros del Este",
    "pj": 10, "pg": 7, "pp": 3,
    "cf": 45, "ce": 30, "dif": 15,
    "porcentaje": "70.00", "ranking": 1
  }
]
```

### GET /api/lideres
Obtener lideres por categoria.

**Query params:**
- `tipo` - `bateo` | `pitcheo` | `defensa` (default: `bateo`)
- `min_ab` - Minimo at-bats (default: 10)

### GET /api/lideres-ofensivos
Top lideres ofensivos con AVG, OBP, SLG, OPS calculados.

### GET /api/lideres-pitcheo
Top lideres de pitcheo con ERA y WHIP.

### GET /api/lideres-defensivos
Top lideres defensivos con fielding percentage.

### GET /api/buscar
Busqueda universal de jugadores y equipos.

**Query params:** `q` (min 2 chars)

**Response:** `200 OK`
```json
{
  "jugadores": [{ "id": 1, "nombre": "Carlos", "tipo": "jugador" }],
  "equipos": [{ "id": 92, "nombre": "Toros", "tipo": "equipo" }]
}
```

---

## Partidos

### GET /api/partidos
Obtener todos los partidos.

### GET /api/partidos/proximos
Obtener proximos partidos programados.

### GET /api/partidos/:id
Obtener partido por ID.

### POST /api/partidos
Crear partido.

**Body:**
```json
{
  "equipo_local_id": 92, "equipo_visitante_id": 93,
  "fecha_partido": "2026-03-15", "hora": "19:00",
  "estado": "programado"
}
```

**Estados validos:** `programado, en_curso, finalizado, cancelado, pospuesto`

### PUT /api/partidos/:id
Actualizar partido.

### DELETE /api/partidos/:id
Eliminar partido.

---

## SSE (Server-Sent Events)

### GET /api/sse/updates
Conectar al stream de eventos en tiempo real.

**Headers de respuesta:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Eventos:**
| Evento | Descripcion |
|---|---|
| `stats-update` | Estadisticas actualizadas (incluye tipo, jugador_id, torneo_id) |
| `tournament-change` | Torneo activo cambiado |
| `general-update` | Recalcular todo |

### GET /api/sse/status
Estado del servicio SSE.

**Response:** `200 OK`
```json
{ "active": true, "clients_connected": 3 }
```

---

## Health Check

### GET /api/health
Verificar estado del servidor y conexion a BD.

**Response:** `200 OK`
```json
{
  "success": true, "status": "ok",
  "timestamp": "2026-02-20T12:00:00Z",
  "environment": "production"
}
```

---

## Aliases Legacy

Para compatibilidad con el frontend, estas rutas alternativas estan disponibles:

| Ruta Legacy | Equivale a |
|---|---|
| `/api/estadisticas-ofensivas` | `/api/estadisticas/ofensivas` |
| `/api/estadisticas-pitcheo` | `/api/estadisticas/pitcheo` |
| `/api/estadisticas-defensivas` | `/api/estadisticas/defensivas` |
| `/api/estadisticas_ofensivas` | `/api/estadisticas/ofensivas` |
| `/api/posiciones` | `/api/dashboard/posiciones` |
| `/api/lideres` | `/api/dashboard/lideres` |
| `/api/buscar` | `/api/dashboard/buscar` |
| `/api/proximos-partidos` | `/api/partidos/proximos` |

## Codigos de Error

| Codigo | Significado |
|---|---|
| 200 | OK |
| 201 | Creado |
| 400 | Request invalido (validacion fallida) |
| 404 | Recurso no encontrado |
| 500 | Error interno del servidor |
| 503 | Demasiadas conexiones SSE |

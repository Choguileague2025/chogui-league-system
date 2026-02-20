# Architecture Overview - Chogui League System

## Patron Arquitectonico

El sistema sigue una arquitectura **MVC (Model-View-Controller)** con capa de servicios:

```
Client (Browser)
    |
    v
[Express.js Server]
    |
    ├── Middleware (compression, cors, logger)
    |
    ├── Routes (definicion de endpoints)
    |   |
    |   v
    ├── Controllers (manejo de request/response)
    |   |
    |   v
    ├── Validators (validacion de entrada)
    |   |
    |   v
    ├── Services (logica de negocio)
    |   |
    |   v
    ├── Utils (calculos, cache)
    |   |
    |   v
    └── Database (PostgreSQL via pg Pool)
```

## Estructura del Proyecto

```
chogui-league-system/
├── server/                    # Backend Node.js/Express
│   ├── config/                # Configuracion (DB, env, CORS)
│   │   ├── database.js        # Pool de PostgreSQL con SSL
│   │   └── cors.js            # CORS con origin: '*'
│   ├── controllers/           # Logica HTTP (thin controllers)
│   │   ├── auth.controller.js
│   │   ├── torneos.controller.js
│   │   ├── equipos.controller.js
│   │   ├── jugadores.controller.js
│   │   ├── partidos.controller.js
│   │   ├── estadisticas.controller.js
│   │   ├── dashboard.controller.js
│   │   └── sse.controller.js
│   ├── services/              # Logica de negocio
│   │   ├── torneos.service.js
│   │   ├── estadisticas.service.js
│   │   └── sse.service.js
│   ├── routes/                # Definicion de rutas
│   │   ├── auth.routes.js
│   │   ├── torneos.routes.js
│   │   ├── equipos.routes.js
│   │   ├── jugadores.routes.js
│   │   ├── partidos.routes.js
│   │   ├── estadisticas.routes.js
│   │   ├── dashboard.routes.js
│   │   └── sse.routes.js
│   ├── validators/            # Validacion de datos
│   │   ├── equipos.validator.js
│   │   ├── jugadores.validator.js
│   │   ├── partidos.validator.js
│   │   ├── estadisticas.validator.js
│   │   └── torneos.validator.js
│   ├── utils/                 # Utilidades
│   │   ├── calculations.js    # 18 funciones puras de stats
│   │   └── cache.js           # SimpleCache con TTL
│   ├── middleware/             # Middleware custom
│   │   ├── logger.js          # Request logging
│   │   └── errorHandler.js    # Error catch-all
│   └── index.js               # Entry point + legacy aliases
├── public/                    # Frontend estatico
│   ├── css/                   # Estilos (+ versiones .min)
│   ├── js/                    # JavaScript modular (+ versiones .min)
│   ├── index.html             # Dashboard principal
│   ├── jugador.html           # Pagina de jugador
│   ├── equipo.html            # Pagina de equipo
│   └── admin.html             # Panel administrativo
├── migrations/                # Migraciones SQL
│   ├── 001_temporada_to_torneo.sql
│   └── 002_performance_indexes.sql
├── tests/                     # Tests (Jest + Supertest)
├── scripts/                   # Scripts utilitarios
│   ├── minify.js              # Build de assets
│   └── run_migration.js       # Ejecutor de migraciones
└── docs/                      # Documentacion
```

## Capas del Sistema

### 1. Middleware Layer

```
request -> compression -> cors -> json parser -> logger -> routes -> error handler
```

| Middleware | Archivo | Funcion |
|---|---|---|
| compression | npm package | Gzip de respuestas HTTP |
| cors | `server/config/cors.js` | Cross-origin con `origin: '*'` |
| json parser | Express built-in | Parse de request body |
| logger | `server/middleware/logger.js` | Log de timestamp + method + URL |
| errorHandler | `server/middleware/errorHandler.js` | Catch-all de errores con stack en dev |

### 2. Routes Layer

8 modulos de rutas independientes montados en `/api`:

| Modulo | Mount Point | Archivo |
|---|---|---|
| Auth | `/api` | `auth.routes.js` |
| Torneos | `/api/torneos` | `torneos.routes.js` |
| Equipos | `/api/equipos` | `equipos.routes.js` |
| Jugadores | `/api/jugadores` | `jugadores.routes.js` |
| Partidos | `/api/partidos` | `partidos.routes.js` |
| Estadisticas | `/api/estadisticas` | `estadisticas.routes.js` |
| Dashboard | `/api/dashboard` | `dashboard.routes.js` |
| SSE | `/api/sse` | `sse.routes.js` |

Ademas, `server/index.js` define **aliases legacy** para compatibilidad con el frontend existente (rutas con guion y guion bajo).

### 3. Controllers Layer

8 controladores que manejan request/response:

| Controller | Funciones | Responsabilidad |
|---|---|---|
| `auth.controller.js` | login | Autenticacion JWT |
| `torneos.controller.js` | 7 funciones | CRUD de torneos + activacion |
| `equipos.controller.js` | 8 funciones | CRUD de equipos + detalles |
| `jugadores.controller.js` | 9 funciones | CRUD + busqueda + similares |
| `partidos.controller.js` | 6 funciones | CRUD de partidos |
| `estadisticas.controller.js` | 11 funciones | Stats ofensivas/pitcheo/defensivas |
| `dashboard.controller.js` | 7 funciones | Posiciones, lideres, busqueda |
| `sse.controller.js` | 2 funciones | SSE connection + status |

### 4. Validators Layer

5 modulos de validacion que sanitizan entrada:

| Validator | Valida |
|---|---|
| `equipos.validator.js` | nombre (3-100), manager, ciudad |
| `jugadores.validator.js` | nombre, posicion (11 validas), numero |
| `partidos.validator.js` | equipos, fecha, estado (5 validos), carreras |
| `estadisticas.validator.js` | jugador_id, campos numericos >= 0 |
| `torneos.validator.js` | nombre (3+), total_juegos, cupos_playoffs |

Patron comun:
```javascript
function validarCrearX(body) {
  return { isValid: true/false, errors: [...], sanitized: {...} }
}
```

### 5. Services Layer

Logica de negocio separada de controllers:

| Service | Funciones |
|---|---|
| `torneos.service.js` | resolveTorneoId, crear, activar, inicializarEstadisticas |
| `estadisticas.service.js` | CRUD + calculos de stats derivadas |
| `sse.service.js` | addClient, notifyAll, notifyStatsUpdate |

### 6. Utils Layer

| Utilidad | Archivo | Funcion |
|---|---|---|
| Calculos | `calculations.js` | 18 funciones puras: AVG, OBP, SLG, OPS, ERA, WHIP, FPCT, etc. |
| Cache | `cache.js` | SimpleCache con TTL, get/set/invalidate |

---

## Flujo de Datos

### Lectura (GET)
```
Request -> Route -> Controller -> [Cache check] -> Service -> Database -> Response
                                    |                                        ^
                                    +--- cache hit --------------------------+
```

### Escritura (POST/PUT)
```
Request -> Route -> Controller -> Validator -> Service -> Database
                        |                                     |
                        +--- cache.invalidate() <-------------+
                        +--- sse.notifyStatsUpdate() ----------> SSE Clients
```

### Ejemplo: Actualizar Estadisticas Ofensivas

```
1. POST /api/estadisticas-ofensivas
2. Route -> estadisticas.controller.upsertOfensivas()
3. Validator: validarEstadisticasOfensivas(body)
4. Service: resolveTorneoId() -> obtener torneo activo
5. Database: INSERT ... ON CONFLICT (jugador_id, torneo_id) DO UPDATE
6. Cache: invalidate('lideres_', 'stats_', 'dashboard_', 'posiciones')
7. SSE: notifyStatsUpdate('ofensivas', jugador_id, torneo_id)
8. Response: { success: true, mode: 'sum', data: {...}, previous: {...} }
```

---

## Sistema de Cache

```
SimpleCache (server/utils/cache.js)
├── TTL: 5 minutos (300,000ms)
├── Storage: Map<string, { value, expiry }>
├── Invalidacion por patron (key.includes(pattern))
└── Endpoints cacheados:
    ├── dashboard_stats
    ├── posiciones
    ├── lideres_{tipo}_{min_ab}
    ├── lideres_ofensivos_{min_ab}
    ├── lideres_pitcheo
    └── lideres_defensivos
```

Invalidacion automatica al actualizar cualquier tipo de estadistica.

---

## SSE (Server-Sent Events)

```
Browser                          Server
  |                                |
  |--- GET /api/sse/updates ------>|
  |<--- 200 text/event-stream -----|
  |<--- :ok\n\n ------------------|
  |                                |
  |  (Admin actualiza stats)       |
  |                                |--- notifyStatsUpdate()
  |<--- event: stats-update -------|
  |<--- data: {tipo, jugador_id} --|
  |                                |
  |  (cada 30s)                    |
  |<--- :ping\n\n ----------------|  (health check)
```

**Configuracion:**
- MAX_CLIENTS: 100 conexiones simultaneas
- Ping interval: 30 segundos (limpia conexiones muertas)
- Eventos: `stats-update`, `tournament-change`, `general-update`

---

## Base de Datos

PostgreSQL hospedado en Railway con las siguientes tablas:

### Esquema de Tablas

| Tabla | Campos Clave | Relaciones |
|---|---|---|
| `torneos` | id, nombre, activo, total_juegos, cupos_playoffs | 1:N con estadisticas |
| `equipos` | id, nombre, ciudad, manager | 1:N con jugadores |
| `jugadores` | id, nombre, equipo_id, posicion, numero | 1:N con estadisticas |
| `estadisticas_ofensivas` | jugador_id, torneo_id, at_bats, hits, etc. | FK: jugador_id, torneo_id |
| `estadisticas_pitcheo` | jugador_id, torneo_id, innings_pitched, etc. | FK: jugador_id, torneo_id |
| `estadisticas_defensivas` | jugador_id, torneo_id, putouts, assists, etc. | FK: jugador_id, torneo_id |
| `partidos` | id, equipo_local_id, equipo_visitante_id, fecha | FK: equipos |
| `usuarios` | id, username, password (hash) | Auth |

### Constraints
- `UNIQUE(jugador_id, torneo_id)` en las 3 tablas de estadisticas
- `ON DELETE CASCADE` de torneos a estadisticas

### Indices de Performance (13)

| Tabla | Indice | Columnas |
|---|---|---|
| jugadores | idx_jugadores_nombre | nombre |
| jugadores | idx_jugadores_equipo_id | equipo_id |
| equipos | idx_equipos_nombre | nombre |
| estadisticas_ofensivas | idx_eo_home_runs | home_runs |
| estadisticas_ofensivas | idx_eo_hits | hits |
| estadisticas_ofensivas | idx_eo_at_bats | at_bats |
| estadisticas_ofensivas | idx_eo_jugador_torneo | jugador_id, torneo_id |
| estadisticas_pitcheo | idx_ep_innings | innings_pitched |
| estadisticas_pitcheo | idx_ep_earned_runs | earned_runs |
| estadisticas_pitcheo | idx_ep_jugador_torneo | jugador_id, torneo_id |
| estadisticas_defensivas | idx_ed_jugador_torneo | jugador_id, torneo_id |
| partidos | idx_partidos_fecha | fecha_partido |
| partidos | idx_partidos_estado | estado |

---

## Frontend

Paginas servidas como archivos estaticos desde `/public`:

| Pagina | Archivo HTML | JavaScript | Funcion |
|---|---|---|---|
| Dashboard | `index.html` | `index_modules.min.js` | Posiciones, lideres, busqueda |
| Admin | `admin.html` | `admin_modules.min.js` | CRUD de datos |
| Jugador | `jugador.html` | `jugador_v2.min.js` | Perfil con tabs, graficos, comparacion |
| Equipo | `equipo.html` | `equipo_v2.min.js` | Roster, stats colectivas, top players |

### Caracteristicas del Frontend
- **Chart.js lazy loading**: Se carga dinamicamente solo en pagina de jugador
- **SSE integration**: Todas las paginas escuchan eventos de actualizacion
- **Tournament selector**: Selector de torneo en todas las vistas
- **Responsive design**: Adaptable a movil y desktop
- **Assets minificados**: JS con Terser, CSS con Clean-CSS (~40% reduccion)

---

## Seguridad

| Aspecto | Implementacion |
|---|---|
| Autenticacion | JWT con bcryptjs para hash de passwords |
| CORS | Habilitado para todos los origenes |
| Validacion | Entrada validada en todas las rutas de escritura |
| SSL | Conexion a PostgreSQL con SSL |
| Error handling | Stack oculto en produccion |
| Compression | Gzip en todas las respuestas HTTP |

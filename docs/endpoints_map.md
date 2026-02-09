# Chogui League System - Endpoints Map

Generated: 2026-02-09
Source: server/index.js (MVC architecture)

## Architecture

```
server/index.js
  |-- /api (auth.routes)
  |-- /api/torneos (torneos.routes)
  |-- /api/equipos (equipos.routes)
  |-- /api/jugadores (jugadores.routes)
  |-- /api/partidos (partidos.routes)
  |-- /api/estadisticas (estadisticas.routes)
  |-- /api/dashboard (dashboard.routes)
  |-- Legacy aliases for frontend compatibility
```

## AUTH
| Method | Route | Controller |
|---|---|---|
| POST | /api/login | auth.login |

## TORNEOS (7 endpoints)
| Method | Route | Controller |
|---|---|---|
| GET | /api/torneos | torneos.obtenerTodos |
| GET | /api/torneos/activo | torneos.obtenerActivo |
| POST | /api/torneos | torneos.crear |
| PUT | /api/torneos/desactivar-todos | torneos.desactivarTodos |
| PUT | /api/torneos/:id/activar | torneos.activar |
| PUT | /api/torneos/:id | torneos.actualizar |
| DELETE | /api/torneos/:id | torneos.eliminar |

## EQUIPOS (8 endpoints)
| Method | Route | Controller |
|---|---|---|
| GET | /api/equipos | equipos.obtenerTodos |
| GET | /api/equipos/:id | equipos.obtenerPorId |
| GET | /api/equipos/:id/detalles | equipos.obtenerDetalles |
| GET | /api/equipos/:id/estadisticas/ofensivas | equipos.obtenerEstadisticasOfensivas |
| GET | /api/equipos/:id/logo | equipos.obtenerLogo |
| POST | /api/equipos | equipos.crear |
| PUT | /api/equipos/:id | equipos.actualizar |
| DELETE | /api/equipos/:id | equipos.eliminar |

## JUGADORES (9 endpoints)
| Method | Route | Controller |
|---|---|---|
| GET | /api/jugadores | jugadores.obtenerTodos |
| GET | /api/jugadores/buscar | jugadores.buscar |
| GET | /api/jugadores/:id | jugadores.obtenerPorId |
| GET | /api/jugadores/:id/partidos | jugadores.obtenerPartidos |
| GET | /api/jugadores/:id/similares | jugadores.obtenerSimilares |
| GET | /api/jugadores/:id/companeros | jugadores.obtenerCompaneros |
| POST | /api/jugadores | jugadores.crear |
| PUT | /api/jugadores/:id | jugadores.actualizar |
| DELETE | /api/jugadores/:id | jugadores.eliminar |

## PARTIDOS (6 endpoints)
| Method | Route | Controller |
|---|---|---|
| GET | /api/partidos | partidos.obtenerTodos |
| GET | /api/partidos/proximos | partidos.obtenerProximos |
| GET | /api/partidos/:id | partidos.obtenerPorId |
| POST | /api/partidos | partidos.crear |
| PUT | /api/partidos/:id | partidos.actualizar |
| DELETE | /api/partidos/:id | partidos.eliminar |

## ESTADISTICAS (11 endpoints via /api/estadisticas/)
| Method | Route | Controller |
|---|---|---|
| GET | /api/estadisticas/ofensivas | estadisticas.obtenerOfensivas |
| POST | /api/estadisticas/ofensivas | estadisticas.upsertOfensivas |
| PUT | /api/estadisticas/ofensivas | estadisticas.upsertOfensivas |
| GET | /api/estadisticas/pitcheo | estadisticas.obtenerPitcheo |
| GET | /api/estadisticas/pitcheo/:id | estadisticas.obtenerPitcheoPorJugador |
| POST | /api/estadisticas/pitcheo | estadisticas.crearPitcheo |
| PUT | /api/estadisticas/pitcheo | estadisticas.actualizarPitcheo |
| GET | /api/estadisticas/defensivas | estadisticas.obtenerDefensivas |
| GET | /api/estadisticas/defensivas/:id | estadisticas.obtenerDefensivasPorJugador |
| POST | /api/estadisticas/defensivas | estadisticas.crearDefensivas |
| PUT | /api/estadisticas/defensivas | estadisticas.actualizarDefensivas |

## DASHBOARD (7 endpoints via /api/dashboard/)
| Method | Route | Controller |
|---|---|---|
| GET | /api/dashboard/stats | dashboard.obtenerStats |
| GET | /api/dashboard/posiciones | dashboard.obtenerPosiciones |
| GET | /api/dashboard/lideres | dashboard.obtenerLideres |
| GET | /api/dashboard/lideres-ofensivos | dashboard.obtenerLideresOfensivos |
| GET | /api/dashboard/lideres-pitcheo | dashboard.obtenerLideresPitcheo |
| GET | /api/dashboard/lideres-defensivos | dashboard.obtenerLideresDefensivos |
| GET | /api/dashboard/buscar | dashboard.buscarUniversal |

## LEGACY ALIASES (frontend compatibility)
| Legacy Route | Maps to |
|---|---|
| GET /api/posiciones | dashboard.obtenerPosiciones |
| GET /api/lideres | dashboard.obtenerLideres |
| GET /api/lideres-ofensivos | dashboard.obtenerLideresOfensivos |
| GET /api/lideres-pitcheo | dashboard.obtenerLideresPitcheo |
| GET /api/lideres-defensivos | dashboard.obtenerLideresDefensivos |
| GET /api/buscar | dashboard.buscarUniversal |
| GET /api/proximos-partidos | partidos.obtenerProximos |
| GET/POST/PUT /api/estadisticas-ofensivas | estadisticas.* |
| GET/POST/PUT /api/estadisticas-pitcheo | estadisticas.* |
| GET/POST/PUT /api/estadisticas-defensivas | estadisticas.* |
| PUT/POST /api/estadisticas_ofensivas | estadisticas.upsertOfensivas |
| PUT/POST /api/estadisticas-ofensivas/:jugadorId | estadisticas.upsertOfensivas |
| PUT/POST /api/estadisticas_ofensivas/:jugadorId | estadisticas.upsertOfensivas |

## MIGRATION: temporada -> torneo_id

All estadisticas endpoints now use `torneo_id` (INTEGER FK) instead of `temporada` (VARCHAR).
- `resolveTorneoId()` in estadisticas.controller.js resolves torneo from active tournament
- ON CONFLICT uses `(jugador_id, torneo_id)` instead of `(jugador_id, temporada)`
- Frontend can still send `temporada` param but it will be ignored in favor of `torneo_id`

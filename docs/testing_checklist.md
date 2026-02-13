# Checklist de Testing Manual - Chogui League System

## Phase 4.1 - Testing Completo

### 1. Health Check
- [ ] `GET /api/health` retorna status 200
- [ ] Response incluye `success: true`, `status: 'ok'`, `timestamp`, `environment`

### 2. Torneos API
- [ ] `GET /api/torneos` retorna lista de torneos (array)
- [ ] `GET /api/torneos/activo` retorna torneo activo (200) o mensaje (404)
- [ ] Torneo activo tiene `id` y `nombre`

### 3. Equipos API
- [ ] `GET /api/equipos` retorna lista de equipos
- [ ] `GET /api/equipos/:id` retorna equipo existente con jugadores
- [ ] `GET /api/equipos/999999` retorna 404

### 4. Jugadores API
- [ ] `GET /api/jugadores` retorna objeto con `jugadores` (array) y `pagination`
- [ ] `GET /api/jugadores?equipo_id=92` filtra correctamente por equipo

### 5. Estadisticas API
- [ ] `GET /api/estadisticas-ofensivas` retorna array de stats
- [ ] `GET /api/estadisticas-pitcheo` retorna array de stats
- [ ] `GET /api/estadisticas-defensivas` retorna array de stats
- [ ] `POST /api/estadisticas-ofensivas` sin `jugador_id` es rechazado (400/422/500)

### 6. Partidos API
- [ ] `GET /api/partidos` retorna objeto con `partidos` (array)
- [ ] Query params (`limit`, `offset`) son aceptados

### 7. SSE (Server-Sent Events)
- [ ] `GET /api/sse/status` retorna `active: true` y `clients_connected` (number)
- [ ] `GET /api/sse/updates` establece conexion SSE con headers correctos
- [ ] Headers SSE: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- [ ] Eventos `stats-update`, `tournament-change`, `general-update` se envian correctamente

### 8. Archivos Estaticos
- [ ] `GET /` sirve `index.html`
- [ ] `GET /admin` sirve `admin.html`
- [ ] `GET /css/optimizations.css` sirve CSS
- [ ] `GET /js/index_modules.js` sirve JavaScript

### 9. Legacy Aliases
- [ ] `GET /api/estadisticas_ofensivas` (guion bajo) funciona igual que con guion

### 10. Validaciones (Server-Side)
- [ ] Equipos: nombre, manager, ciudad son requeridos
- [ ] Jugadores: nombre, equipo_id requeridos; posicion validada contra lista
- [ ] Partidos: equipo_local_id, equipo_visitante_id, fecha requeridos; estado validado
- [ ] Estadisticas: jugador_id requerido; campos numericos sanitizados a enteros >= 0
- [ ] Torneos: nombre requerido; defaults aplicados (total_juegos=22, cupos_playoffs=6)

### 11. Calculos Estadisticos
- [ ] AVG = hits / at_bats (0 si AB=0)
- [ ] OBP = (H+BB+HBP) / (AB+BB+HBP+SF)
- [ ] SLG = TB / AB
- [ ] OPS = OBP + SLG
- [ ] ERA = (ER * 7) / IP (7 innings por juego)
- [ ] WHIP = (BB+H) / IP
- [ ] FPCT = (PO+A) / (PO+A+E)

### 12. Frontend (Manual)
- [ ] index.html carga correctamente
- [ ] Selector de torneos funciona
- [ ] Tabla de estadisticas muestra datos
- [ ] Paginacion funciona (siguiente/anterior)
- [ ] Busqueda en tabla filtra resultados
- [ ] SSE dot indicator muestra estado de conexion
- [ ] admin.html carga correctamente
- [ ] Pagina de jugador (`jugador.html?id=X`) carga datos
- [ ] Pagina de equipo (`equipo.html?id=X`) carga datos

### 13. Responsive
- [ ] index.html se adapta a mobile (< 768px)
- [ ] admin.html se adapta a mobile
- [ ] Tablas son scrollables en pantallas pequenas
- [ ] Selector de torneos se apila verticalmente en mobile

# Roadmap de Evolucion: Estadisticas Historicas, Torneos, Ligas y UX

Fecha: 2026-05-22
Estado: Propuesta inicial para ejecucion por fases

## 1. Objetivo General

Convertir Chogui League System de un sistema con estadisticas acumuladas por torneo a una plataforma completa de softball con:

- estadisticas oficiales por torneo
- historico acumulado por jugador
- historico acumulado por equipo
- standings y lideres consistentes por torneo
- soporte futuro para multiples ligas y divisiones
- game logs y box scores
- UX moderna orientada a consulta rapida, comparacion y narrativa estadistica

## 2. Principios de Diseno

- Una sola fuente de verdad para cada calculo
- Todo ranking debe poder filtrarse por torneo, liga y rango temporal
- Toda metrica agregada debe poder reconstruirse desde datos por partido
- El frontend no debe depender de campos legacy como `temporada`
- Las formulas oficiales deben ser configurables por competencia
- El usuario debe entender rapido contexto, nivel y tendencia

## 3. Problemas Actuales a Resolver

### Modelo de datos

- `partidos` no tiene `torneo_id`
- no existe `liga_id` o `division_id`
- las stats se guardan como acumulados por `jugador_id + torneo_id`
- no existen tablas por partido para box score o game log
- no existe tabla de records historicos ni snapshots

### Backend

- standings mezclan todos los partidos
- lideres globales no respetan torneo de forma consistente
- algunos endpoints usan fallback al torneo activo aunque la UI diga "todos"
- existe logica legacy de `temporada` en frontend
- formulas y documentacion no estan alineadas del todo

### Frontend / UX

- la experiencia mezcla vistas modernas con codigo inline legacy
- faltan paginas de historico real para jugadores y equipos
- faltan filtros profundos: torneo, carrera, ultimo N juegos, vs rival, home/away
- falta narrativa de records, rachas, hitos y comparativas oficiales

## 4. Vision del Producto

### Entidades principales futuras

- Liga
- Division
- Torneo
- Equipo
- Jugador
- Partido
- Participacion por partido
- Estadisticas agregadas
- Records historicos

### Niveles de consulta

- Nivel 1: Liga o division
- Nivel 2: Torneo
- Nivel 3: Equipo
- Nivel 4: Jugador
- Nivel 5: Partido

## 5. Arquitectura Objetivo

### 5.1 Dimensiones

- `ligas`
- `divisiones`
- `torneos`
- `equipos`
- `jugadores`

### 5.2 Hechos deportivos

- `partidos`
- `partido_jugador_ofensiva`
- `partido_jugador_pitcheo`
- `partido_jugador_defensa`
- `partido_equipo_resumen`

### 5.3 Agregados derivados

- `stats_jugador_torneo`
- `stats_jugador_carrera`
- `stats_equipo_torneo`
- `stats_equipo_carrera`
- `leaders_cache` o vistas materializadas

### 5.4 Configuracion reglamentaria

- `config_competencia`

Campos sugeridos:

- `innings_por_juego`
- `min_ab_lider_bateo`
- `min_ip_lider_era`
- `min_chances_lider_defensa`
- `usa_run_rule`
- `usa_tiebreakers_personalizados`

## 6. Fases de Ejecucion

## Fase 0. Normalizacion y Cierre Tecnico

Objetivo:
Dejar el sistema consistente antes de crecer.

Entregables:

- eliminar uso funcional de `temporada` en frontend
- unificar formulas en `server/utils/calculations.js`
- hacer que standings y lideres respeten `torneo_id`
- alinear documentacion y tests con reglas oficiales
- definir si la competencia usa base de 7 innings o configurable

Cambios tecnicos:

- agregar query params estandar: `torneo_id`, `scope`, `liga_id`, `division_id`
- invalidacion de cache por torneo
- refactor de `/api/standings`, `/api/lideres`, `/api/leaders`
- pruebas de integracion para filtros por torneo

Criterio de exito:

- el mismo torneo produce exactamente los mismos resultados en home, equipo y jugador

## Fase 1. Torneos Reales en Partidos

Objetivo:
Conectar standings y records de equipo con torneos reales.

Entregables:

- agregar `torneo_id` a `partidos`
- migrar partidos existentes al torneo activo o al mapeo definido
- standings por torneo
- proximos partidos por torneo
- records de equipo por torneo

Cambios tecnicos:

- migracion SQL para `partidos.torneo_id`
- indices por `torneo_id`, `estado`, `fecha_partido`
- actualizar controllers y validators de partidos
- actualizar vistas de index, equipo y admin para filtrar partidos correctamente

Criterio de exito:

- cambiar de torneo actualiza posiciones, record, forma y calendario sin mezclar datos

## Fase 2. Modelo por Partido

Objetivo:
Registrar la verdad base del sistema por juego.

Entregables:

- tablas `partido_jugador_ofensiva`, `partido_jugador_pitcheo`, `partido_jugador_defensa`
- carga administrativa por box score
- recalculo de acumulados desde datos por partido
- game log por jugador
- resumen por equipo por partido

Campos minimos sugeridos:

- Ofensiva: AB, H, 1B, 2B, 3B, HR, RBI, R, BB, SO, SB, CS, HBP, SF, SH
- Pitcheo: IP, H, ER, R, BB, SO, HR, W, L, SV, HBP, WP, BF
- Defensa: PO, A, E, DP, PB, CS, SB contra, chances

Cambios tecnicos:

- proceso de migracion desde acumulados existentes a una capa inicial de apertura
- servicio de recalc global por torneo y por jugador
- endpoint de box score y endpoint de game log

Criterio de exito:

- cualquier acumulado de jugador y equipo puede recomponerse a partir de partidos

## Fase 3. Historico y Career Stats

Objetivo:
Habilitar record historico real de jugadores y equipos.

Entregables:

- career stats por jugador
- career stats por equipo
- records por torneo, por carrera y por temporada
- mejores temporadas
- rachas y hitos
- comparativas historicas

Nuevas vistas:

- perfil de jugador con tabs: torneo actual, carrera, game log, records, comparacion
- perfil de equipo con tabs: temporada, historico, roster, records, head-to-head

Cambios tecnicos:

- vistas SQL o tablas agregadas `stats_jugador_carrera` y `stats_equipo_carrera`
- endpoint `/api/jugadores/:id/historico`
- endpoint `/api/equipos/:id/historico`
- endpoint `/api/records`

Criterio de exito:

- un jugador puede ver su total historico, sus mejores torneos y su progresion

## Fase 4. Multi-Liga y Divisiones

Objetivo:
Escalar la plataforma para varias competiciones.

Entregables:

- `ligas` y `divisiones`
- torneos asociados a una liga/division
- filtros por competencia
- portadas separadas por liga
- panel admin con contexto de liga

Cambios tecnicos:

- agregar `liga_id` y opcional `division_id` a `torneos`, `equipos`
- permisos admin por liga en futuro
- endpoints multi-tenant logicos

Criterio de exito:

- dos ligas pueden convivir sin mezclar standings, lideres ni records

## Fase 5. UX Redesign Integral

Objetivo:
Rediseñar la experiencia para convertir el sistema en una plataforma de consulta deportiva moderna.

### 5.1 Home / Dashboard

Nueva estructura:

- Hero con torneo activo, fecha y estado competitivo
- resumen rapido: lider de tabla, MVP ofensivo, mejor pitcher, racha caliente
- standings interactivo
- leaders hub por categoria
- ultimos resultados
- proximos partidos
- tarjetas de narrativas: "mejor OPS", "racha de victorias", "equipo en ascenso"

### 5.2 Perfil de Jugador

Bloques:

- header con identidad fuerte
- resumen del torneo actual
- career totals
- mejores temporadas
- game log
- splits
- comparacion contra media de liga
- radar y percentiles
- records personales

### 5.3 Perfil de Equipo

Bloques:

- identidad visual del club
- record del torneo
- historico all-time
- produccion ofensiva colectiva
- staff de pitcheo
- roster con filtros
- resultados recientes
- historial vs rivales
- records del club

### 5.4 Admin

Redisenar admin en flujos:

- Crear torneo
- Programar partido
- Cargar box score
- Corregir estadisticas
- Ver impacto en standings
- Auditar cambios

### 5.5 Lenguaje visual

Direccion recomendada:

- look editorial-deportivo
- jerarquia tipografica fuerte
- cards con contexto y narrativa
- densidad alta de informacion sin verse saturado
- mobile-first en tablas con cards adaptativas

## 7. Estructura de Endpoints Objetivo

### Publicos

- `GET /api/standings?torneo_id=`
- `GET /api/leaders?scope=torneo|carrera&torneo_id=&categoria=`
- `GET /api/jugadores/:id/resumen`
- `GET /api/jugadores/:id/historico`
- `GET /api/jugadores/:id/game-log`
- `GET /api/equipos/:id/resumen`
- `GET /api/equipos/:id/historico`
- `GET /api/equipos/:id/head-to-head`
- `GET /api/records?scope=torneo|carrera`
- `GET /api/partidos/:id/boxscore`

### Admin

- `POST /api/partidos`
- `POST /api/partidos/:id/boxscore`
- `POST /api/recalculate/torneo/:id`
- `POST /api/recalculate/jugador/:id`
- `POST /api/recalculate/equipo/:id`

## 8. Prioridad Recomendada

### Prioridad inmediata

1. Fase 0
2. Fase 1
3. Fase 2 base

### Prioridad de negocio

1. Historico de jugador
2. Historico de equipo
3. Records y leaders oficiales
4. UX rediseñada

## 9. Riesgos y Mitigaciones

### Riesgo: datos legacy inconsistentes

Mitigacion:

- scripts de validacion
- migraciones reversibles
- tablas de respaldo

### Riesgo: duplicidad entre stats acumuladas y stats por partido

Mitigacion:

- declarar una sola fuente de verdad
- acumulados derivados por recalc

### Riesgo: performance al crecer historico

Mitigacion:

- indices compuestos
- vistas materializadas
- cache por torneo y scope

### Riesgo: UX fragmentada durante transicion

Mitigacion:

- redisenar por modulo
- apagar gradualmente vistas legacy

## 10. Plan de Arranque

### Sprint 1

- auditar formulas
- hacer standings por torneo reales
- hacer lideres por torneo reales
- remover dependencias activas de `temporada`

### Sprint 2

- agregar `torneo_id` a partidos
- migrar partidos
- actualizar index, equipo y jugador con filtros consistentes

### Sprint 3

- crear tablas por partido
- crear flujo admin de box score
- generar career stats iniciales

## 11. Decision Tecnica Recomendada

La estrategia correcta no es seguir creciendo sobre acumulados manuales.

La estrategia correcta es:

1. usar partido como fuente base
2. derivar acumulados por torneo
3. derivar historico de carrera
4. construir UX sobre agregados consistentes

Eso deja el sistema listo para records historicos, comparativas serias y futuras multiples ligas.

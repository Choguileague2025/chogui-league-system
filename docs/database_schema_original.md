# Chogui League System - Database Schema Original

Documentado: 2026-02-08
Base de datos: PostgreSQL (Railway)
Total de tablas: 8

---

## 1. equipos (11 registros)

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (PK) | NO | autoincrement |
| nombre | varchar(100) | NO | - |
| manager | varchar(100) | NO | - |
| ciudad | varchar(100) | NO | - |
| fecha_creacion | timestamp | YES | CURRENT_TIMESTAMP |
| estado | varchar(20) | YES | 'activo' |

**Constraints:** PK(id), UNIQUE(nombre)

---

## 2. jugadores (249 registros)

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (PK) | NO | autoincrement |
| nombre | varchar(100) | NO | - |
| equipo_id | integer (FK) | YES | - |
| posicion | varchar(10) | YES | - |
| numero | integer | YES | - |
| created_at | timestamp | YES | CURRENT_TIMESTAMP |

**Constraints:** PK(id), FK(equipo_id) -> equipos(id)

---

## 3. estadisticas_ofensivas (249 registros)

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (PK) | NO | autoincrement |
| jugador_id | integer (FK) | YES | - |
| at_bats | integer | YES | 0 |
| hits | integer | YES | 0 |
| home_runs | integer | YES | 0 |
| rbi | integer | YES | 0 |
| runs | integer | YES | 0 |
| walks | integer | YES | 0 |
| stolen_bases | integer | YES | 0 |
| strikeouts | integer | YES | 0 |
| doubles | integer | YES | 0 |
| triples | integer | YES | 0 |
| caught_stealing | integer | YES | 0 |
| hit_by_pitch | integer | YES | 0 |
| sacrifice_flies | integer | YES | 0 |
| sacrifice_hits | integer | YES | 0 |
| partidos_jugados | integer | NO | 0 |
| temporada | varchar(100) | YES | '2025' |
| fecha_registro | timestamp | YES | now() |
| fecha_actualizacion | timestamp | YES | CURRENT_TIMESTAMP |

**Constraints:** PK(id), FK(jugador_id) -> jugadores(id), UNIQUE(jugador_id, temporada)

---

## 4. estadisticas_defensivas (17 registros)

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (PK) | NO | autoincrement |
| jugador_id | integer (FK) | YES | - |
| putouts | integer | YES | 0 |
| assists | integer | YES | 0 |
| errors | integer | YES | 0 |
| double_plays | integer | YES | 0 |
| passed_balls | integer | YES | 0 |
| stolen_bases_against | integer | YES | 0 |
| caught_stealing | integer | YES | 0 |
| chances | integer | YES | 0 |
| partidos_jugados | integer | NO | 0 |
| temporada | varchar(100) | YES | '2025' |
| fecha_registro | timestamp | YES | now() |

**Constraints:** PK(id), FK(jugador_id) -> jugadores(id), UNIQUE(jugador_id, temporada)

---

## 5. estadisticas_pitcheo (4 registros)

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (PK) | NO | autoincrement |
| jugador_id | integer (FK) | YES | - |
| innings_pitched | numeric | YES | 0 |
| hits_allowed | integer | YES | 0 |
| earned_runs | integer | YES | 0 |
| strikeouts | integer | YES | 0 |
| walks_allowed | integer | YES | 0 |
| home_runs_allowed | integer | YES | 0 |
| wins | integer | YES | 0 |
| losses | integer | YES | 0 |
| saves | integer | YES | 0 |
| games_started | integer | YES | 0 |
| games_finished | integer | YES | 0 |
| complete_games | integer | YES | 0 |
| shutouts | integer | YES | 0 |
| hit_batters | integer | YES | 0 |
| wild_pitches | integer | YES | 0 |
| balks | integer | YES | 0 |
| temporada | varchar(100) | YES | '2025' |
| fecha_registro | timestamp | YES | now() |

**Constraints:** PK(id), FK(jugador_id) -> jugadores(id), UNIQUE(jugador_id, temporada)

---

## 6. partidos (16 registros)

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (PK) | NO | autoincrement |
| equipo_local_id | integer (FK) | YES | - |
| equipo_visitante_id | integer (FK) | YES | - |
| carreras_local | integer | YES | 0 |
| carreras_visitante | integer | YES | 0 |
| innings_jugados | integer | YES | 9 |
| fecha_partido | date | NO | - |
| hora | time | YES | - |
| estado | varchar(20) | YES | 'programado' |
| created_at | timestamp | YES | CURRENT_TIMESTAMP |

**Constraints:** PK(id), FK(equipo_local_id) -> equipos(id), FK(equipo_visitante_id) -> equipos(id)

---

## 7. torneos (1 registro)

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (PK) | NO | autoincrement |
| nombre | varchar(100) | NO | - |
| fecha_inicio | timestamp | YES | CURRENT_TIMESTAMP |
| activo | boolean | YES | false |
| total_juegos | integer | YES | 22 |
| cupos_playoffs | integer | YES | 8 |

**Constraints:** PK(id), UNIQUE(nombre)

---

## 8. usuarios (1 registro)

| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | integer (PK) | NO | autoincrement |
| username | varchar(50) | NO | - |
| password | varchar(255) | NO | - |
| role | varchar(20) | NO | 'admin' |
| created_at | timestamp | YES | CURRENT_TIMESTAMP |

**Constraints:** PK(id), UNIQUE(username)

---

## Diagrama de Relaciones

```
torneos (standalone)
usuarios (standalone)

equipos
  |-- jugadores (equipo_id -> equipos.id)
  |     |-- estadisticas_ofensivas (jugador_id -> jugadores.id)
  |     |-- estadisticas_defensivas (jugador_id -> jugadores.id)
  |     |-- estadisticas_pitcheo (jugador_id -> jugadores.id)
  |
  |-- partidos (equipo_local_id -> equipos.id)
  |-- partidos (equipo_visitante_id -> equipos.id)
```

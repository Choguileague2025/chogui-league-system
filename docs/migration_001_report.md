# Migration 001: temporada (VARCHAR) -> torneo_id (INTEGER FK)

**Fecha:** 2026-02-08
**Rama:** feature/refactorization-v2
**Estado:** COMPLETADA EXITOSAMENTE

---

## Objetivo

Migrar el modelo de "temporada" (campo VARCHAR libre) a "torneo_id" (clave foranea a tabla torneos) en las 3 tablas de estadisticas, para establecer relaciones formales entre estadisticas y torneos.

---

## Analisis Pre-Migracion

### Tablas afectadas

| Tabla | Registros | Valor temporada |
|---|---|---|
| estadisticas_ofensivas | 249 | "2024" (unico) |
| estadisticas_pitcheo | 4 | "2024" (unico) |
| estadisticas_defensivas | 17 | "2024" (unico) |

### Tabla torneos (pre-migracion)

| ID | Nombre | Activo |
|---|---|---|
| 51 | Copa verano ferreteria | true |

### Constraints originales eliminados

- `estadisticas_ofensivas_jugador_id_temporada_key` UNIQUE (jugador_id, temporada)
- `estadisticas_pitcheo_jugador_id_temporada_key` UNIQUE (jugador_id, temporada)
- `estadisticas_defensivas_jugador_id_temporada_key` UNIQUE (jugador_id, temporada)

---

## Cambios Realizados

### 1. Nuevo torneo creado

| ID | Nombre | Activo | Motivo |
|---|---|---|---|
| 52 | Temporada 2024 | false | Mapeo de temporada="2024" |

### 2. Columnas

| Accion | Columna | Tablas |
|---|---|---|
| ADDED | torneo_id (INTEGER NOT NULL) | 3 tablas |
| DROPPED | temporada (VARCHAR) | 3 tablas |

### 3. Mapeo de datos

- Todos los registros con `temporada="2024"` -> `torneo_id=52` ("Temporada 2024")
- 249 + 4 + 17 = **270 registros actualizados**
- **0 NULLs** resultantes

### 4. Constraints nuevos

| Constraint | Tipo | Tabla |
|---|---|---|
| fk_stats_ofensivas_torneo | FOREIGN KEY -> torneos(id) ON DELETE CASCADE | estadisticas_ofensivas |
| fk_stats_pitcheo_torneo | FOREIGN KEY -> torneos(id) ON DELETE CASCADE | estadisticas_pitcheo |
| fk_stats_defensivas_torneo | FOREIGN KEY -> torneos(id) ON DELETE CASCADE | estadisticas_defensivas |
| unique_jugador_torneo_ofensivas | UNIQUE (jugador_id, torneo_id) | estadisticas_ofensivas |
| unique_jugador_torneo_pitcheo | UNIQUE (jugador_id, torneo_id) | estadisticas_pitcheo |
| unique_jugador_torneo_defensivas | UNIQUE (jugador_id, torneo_id) | estadisticas_defensivas |

### 5. Indices creados

| Indice | Tabla |
|---|---|
| idx_stats_ofensivas_torneo | estadisticas_ofensivas(torneo_id) |
| idx_stats_pitcheo_torneo | estadisticas_pitcheo(torneo_id) |
| idx_stats_defensivas_torneo | estadisticas_defensivas(torneo_id) |

---

## Verificacion Post-Migracion

| Check | Resultado |
|---|---|
| Columna temporada eliminada | OK (3 tablas) |
| Columna torneo_id existe | OK (3 tablas) |
| Cero NULLs en torneo_id | OK (0/249, 0/4, 0/17) |
| Conteo registros inalterado | OK (249, 4, 17) |
| FK constraints activos | OK (3 FKs) |
| UNIQUE constraints activos | OK (3 UNIQUE) |
| Indices creados | OK (6 indices) |
| JOIN con torneos funcional | OK (datos verificados) |
| FK rechaza IDs invalidos | OK (torneo_id=99999 rechazado) |

---

## Diagrama de Relaciones Actualizado

```
torneos
  |-- estadisticas_ofensivas (torneo_id -> torneos.id) CASCADE
  |-- estadisticas_pitcheo (torneo_id -> torneos.id) CASCADE
  |-- estadisticas_defensivas (torneo_id -> torneos.id) CASCADE

equipos
  |-- jugadores (equipo_id -> equipos.id)
  |     |-- estadisticas_ofensivas (jugador_id -> jugadores.id)
  |     |-- estadisticas_defensivas (jugador_id -> jugadores.id)
  |     |-- estadisticas_pitcheo (jugador_id -> jugadores.id)
  |
  |-- partidos (equipo_local_id -> equipos.id)
  |-- partidos (equipo_visitante_id -> equipos.id)
```

---

## Rollback

Disponible en: `migrations/001_rollback.sql`

Procedimiento: ejecutar el script completo que revierte todos los cambios, incluyendo restaurar la columna temporada con los valores originales y eliminar el torneo "Temporada 2024".

---

## Archivos Relacionados

- `migrations/001_temporada_to_torneo.sql` - Script de migracion
- `migrations/001_rollback.sql` - Script de rollback
- `backups/db_backup_2026-02-08T15-18-49.sql` - Backup pre-migracion

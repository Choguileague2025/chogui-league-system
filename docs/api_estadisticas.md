# API de Estadísticas - Chogui League System

## Modos de Actualización

Todos los endpoints POST/PUT de estadísticas soportan dos modos de actualización:

| Modo | Descripción | Uso |
|------|-------------|-----|
| `sum` | Suma los valores enviados a los existentes | Agregar stats de un juego nuevo (default) |
| `replace` | Sobreescribe completamente los valores existentes | Corregir o reiniciar estadísticas |

El modo se envía como parámetro `mode` en el body del request. Si no se envía, se usa `sum` por defecto.

Si no existe un registro previo, ambos modos crean un registro nuevo con los valores enviados.

---

## Estadísticas Ofensivas

### GET /api/estadisticas-ofensivas

Obtener estadísticas ofensivas con filtros opcionales.

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `torneo_id` | number\|"todos" | ID del torneo, o "todos" para agregar todos |
| `equipo_id` | number | Filtrar por equipo |
| `jugador_id` | number | Filtrar por jugador |
| `min_at_bats` | number | Mínimo de at-bats (default: 0) |

**Ejemplo:**
```
GET /api/estadisticas-ofensivas?torneo_id=51&equipo_id=97
GET /api/estadisticas-ofensivas?torneo_id=todos&min_at_bats=10
```

**Respuesta:** Array de objetos con stats + campos calculados (avg, obp, slg, ops).

### POST /api/estadisticas-ofensivas

Crear o actualizar estadísticas ofensivas de un jugador.

**Body:**
```json
{
  "jugador_id": 1004,
  "torneo_id": 51,
  "mode": "sum",
  "at_bats": 4,
  "hits": 2,
  "doubles": 1,
  "triples": 0,
  "home_runs": 0,
  "rbi": 1,
  "runs": 1,
  "walks": 1,
  "strikeouts": 0,
  "stolen_bases": 0,
  "caught_stealing": 0,
  "hit_by_pitch": 0,
  "sacrifice_flies": 0,
  "sacrifice_hits": 0
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Estadísticas ofensivas sumadas correctamente",
  "mode": "sum",
  "data": { "...registro actualizado..." },
  "previous": {
    "at_bats": 10,
    "hits": 3,
    "home_runs": 1,
    "rbi": 2,
    "runs": 1,
    "walks": 1
  }
}
```

El campo `previous` contiene los valores antes de la actualización (null si no existía registro previo).

---

## Estadísticas de Pitcheo

### GET /api/estadisticas-pitcheo

Obtener estadísticas de pitcheo con filtros opcionales.

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `torneo_id` | number\|"todos" | ID del torneo, o "todos" para agregar todos |
| `equipo_id` | number | Filtrar por equipo |
| `jugador_id` | number | Filtrar por jugador |

**Respuesta:** Array de objetos con stats + campos calculados (era, whip).

### GET /api/estadisticas-pitcheo/:id

Obtener estadísticas de pitcheo de un jugador específico.

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `torneo_id` | number | ID del torneo (opcional, usa activo por default) |

### POST /api/estadisticas-pitcheo

Crear o actualizar estadísticas de pitcheo.

**Body:**
```json
{
  "jugador_id": 1004,
  "torneo_id": 51,
  "mode": "sum",
  "innings_pitched": 6.0,
  "hits_allowed": 4,
  "earned_runs": 2,
  "strikeouts": 5,
  "walks_allowed": 2,
  "home_runs_allowed": 0,
  "wins": 1,
  "losses": 0,
  "saves": 0
}
```

**Nota:** `innings_pitched` es de tipo numérico decimal.

**Respuesta:**
```json
{
  "success": true,
  "message": "Estadísticas de pitcheo sumadas correctamente",
  "mode": "sum",
  "data": { "...registro actualizado..." },
  "previous": {
    "innings_pitched": "6.0",
    "earned_runs": 2,
    "strikeouts": 5,
    "wins": 1,
    "losses": 0
  }
}
```

### PUT /api/estadisticas-pitcheo

Actualizar estadísticas de pitcheo existentes. Mismo body y respuesta que POST.

---

## Estadísticas Defensivas

### GET /api/estadisticas-defensivas

Obtener estadísticas defensivas con filtros opcionales.

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `torneo_id` | number\|"todos" | ID del torneo, o "todos" para agregar todos |
| `equipo_id` | number | Filtrar por equipo |
| `jugador_id` | number | Filtrar por jugador |

**Respuesta:** Array de objetos con stats + campo calculado (fielding_percentage).

### GET /api/estadisticas-defensivas/:id

Obtener estadísticas defensivas de un jugador específico.

### POST /api/estadisticas-defensivas

Crear o actualizar estadísticas defensivas.

**Body:**
```json
{
  "jugador_id": 1004,
  "torneo_id": 51,
  "mode": "sum",
  "putouts": 5,
  "assists": 3,
  "errors": 1,
  "double_plays": 1,
  "passed_balls": 0,
  "chances": 9
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Estadísticas defensivas sumadas correctamente",
  "mode": "sum",
  "data": { "...registro actualizado..." },
  "previous": {
    "putouts": 5,
    "assists": 3,
    "errors": 1,
    "chances": 9
  }
}
```

### PUT /api/estadisticas-defensivas

Actualizar estadísticas defensivas existentes. Mismo body y respuesta que POST.

---

## Resolución de Torneo

Si no se envía `torneo_id` en el body, el sistema resuelve automáticamente:

1. **Torneo activo** → usa el torneo marcado como activo
2. **Torneo más reciente** → si no hay activo, usa el último creado

Se recomienda siempre enviar `torneo_id` explícitamente para evitar ambigüedades.

## Campos Calculados

Los siguientes campos NO se almacenan en la base de datos, se calculan en cada consulta:

| Campo | Tabla | Fórmula |
|-------|-------|---------|
| `avg` | Ofensivas | hits / at_bats |
| `obp` | Ofensivas | (hits + walks) / (at_bats + walks) |
| `slg` | Ofensivas | (hits + home_runs * 3) / at_bats |
| `ops` | Ofensivas | obp + slg |
| `era` | Pitcheo | (earned_runs * 9) / innings_pitched |
| `whip` | Pitcheo | (hits_allowed + walks_allowed) / innings_pitched |
| `fielding_percentage` | Defensivas | (putouts + assists) / chances |

## Errores Comunes

| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | "ID de jugador requerido y válido" | jugador_id faltante o no numérico |
| 400 | "Modo inválido. Use sum o replace." | mode no es "sum" ni "replace" |
| 400 | "No se pudo determinar el torneo" | No hay torneo_id y no hay torneo activo |

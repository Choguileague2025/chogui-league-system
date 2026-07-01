# Release Checklist

## 1. Variables

- Definir `DATABASE_URL`
- Definir `JWT_SECRET`
- Definir `NODE_ENV=production`

## 2. Migraciones

Ejecutar:

```bash
node scripts/run_migration.js
```

Debe aplicar, en orden:

- `001_temporada_to_torneo.sql`
- `002_performance_indexes.sql`
- `003_playoff_bracket.sql`
- `004_partidos_torneo.sql`
- `005_multi_liga.sql`
- `006_boxscore_historico.sql`

## 3. Verificacion funcional

- Crear o activar un torneo
- Registrar un partido desde admin
- Registrar estadísticas ofensivas, pitcheo y defensa desde admin
- Verificar reflejo en:
  - página pública principal
  - perfil de jugador
  - perfil de equipo
- Consultar:
  - `/api/jugadores/:id/historico`
  - `/api/jugadores/:id/game-log`
  - `/api/equipos/:id/historico`
  - `/api/equipos/:id/head-to-head`
  - `/api/partidos/:id/boxscore`

## 4. Smoke test post deploy

```bash
BASE_URL="https://tu-app.up.railway.app" node scripts/smoke_test.js
```

## 5. Validacion comercial

- Confirmar que una liga nueva puede crear:
  - ligas
  - divisiones
  - torneos
  - equipos
- Confirmar aislamiento por torneo
- Confirmar histórico acumulado por jugador y equipo
- Confirmar standings y líderes correctos

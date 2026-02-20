# Deployment Guide - Chogui League System

## Despliegue en Railway

### Prerequisitos

1. Cuenta en [Railway](https://railway.app)
2. Repositorio en GitHub
3. PostgreSQL provisionado en Railway

### Paso 1: Crear Proyecto en Railway

1. Ir a [railway.app/new](https://railway.app/new)
2. Seleccionar "Deploy from GitHub repo"
3. Conectar tu repositorio
4. Railway detecta automaticamente que es un proyecto Node.js

### Paso 2: Provisionar PostgreSQL

1. En el dashboard del proyecto, click "New Service"
2. Seleccionar "Database" > "PostgreSQL"
3. Railway crea la BD y genera automaticamente `DATABASE_URL`

### Paso 3: Variables de Entorno

Configurar en Railway > Settings > Variables:

| Variable | Valor | Requerida |
|---|---|---|
| `DATABASE_URL` | (auto-generada por Railway PostgreSQL) | Si |
| `JWT_SECRET` | String secreto para tokens JWT | Si |
| `NODE_ENV` | `production` | Si |
| `PORT` | `8080` (Railway asigna automaticamente) | No |

### Paso 4: Build y Start

Railway ejecuta automaticamente:
```bash
npm install
npm start
```

El servidor inicia en el puerto asignado por Railway (`process.env.PORT`).

### Paso 5: Ejecutar Migraciones

Opcion A - Desde Railway CLI:
```bash
railway run node scripts/run_migration.js
```

Opcion B - Desde local con DATABASE_URL de Railway:
```bash
DATABASE_URL="postgresql://..." node scripts/run_migration.js
```

### Paso 6: Verificar Despliegue

```bash
curl https://your-app.up.railway.app/api/health
```

Respuesta esperada:
```json
{ "success": true, "status": "ok", "environment": "production" }
```

---

## Despliegue Local (Desarrollo)

### Paso 1: Configurar Base de Datos

Opcion A - PostgreSQL local:
```bash
createdb chogui_league
```

Opcion B - Usar Railway PostgreSQL desde local:
```bash
# Copiar DATABASE_URL de Railway
```

### Paso 2: Configurar .env

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/chogui_league
JWT_SECRET=dev_secret_key
NODE_ENV=development
PORT=8080
```

### Paso 3: Instalar y Ejecutar

```bash
npm install
node scripts/run_migration.js
npm run dev
```

El servidor estara disponible en `http://localhost:8080`.

---

## Scripts Disponibles

| Script | Comando | Descripcion |
|---|---|---|
| `start` | `npm start` | Inicia el servidor en produccion |
| `dev` | `npm run dev` | Inicia con nodemon (auto-reload) |
| `test` | `npm test` | Ejecuta suite de tests (134 tests) |
| `test:coverage` | `npm run test:coverage` | Tests con reporte de coverage |
| `test:watch` | `npm run test:watch` | Tests en modo watch |
| `build` | `npm run build` | Minifica JS y CSS |

---

## Build de Assets

Antes de desplegar, minificar los assets:

```bash
npm run build
```

Esto genera archivos `.min.js` y `.min.css` en `public/` que son referenciados por los HTML.

**Archivos generados:**

| Fuente | Minificado | Reduccion |
|---|---|---|
| `js/index_modules.js` | `js/index_modules.min.js` | ~40% |
| `js/admin_modules.js` | `js/admin_modules.min.js` | ~45% |
| `js/jugador_v2.js` | `js/jugador_v2.min.js` | ~50% |
| `js/equipo_v2.js` | `js/equipo_v2.min.js` | ~45% |
| `css/optimizations.css` | `css/optimizations.min.css` | ~30% |
| `css/jugador_v2.css` | `css/jugador_v2.min.css` | ~35% |
| `css/equipo_v2.css` | `css/equipo_v2.min.css` | ~30% |
| `css/equipo.css` | `css/equipo.min.css` | ~30% |

**Importante:** Los archivos HTML ya apuntan a las versiones minificadas. Si modificas algun JS/CSS, ejecuta `npm run build` antes de hacer commit.

---

## Migraciones de Base de Datos

| Migration | Archivo | Descripcion |
|---|---|---|
| 001 | `migrations/001_temporada_to_torneo.sql` | Migrar temporada VARCHAR a torneo_id FK |
| 002 | `migrations/002_performance_indexes.sql` | Indices de performance |

Ejecutar migraciones:
```bash
node scripts/run_migration.js
```

El script lee los archivos SQL y los ejecuta contra la BD configurada en `DATABASE_URL`.

---

## Monitoreo

### Health Check
```
GET /api/health
```
Retorna estado del servidor y conexion a BD.

### SSE Status
```
GET /api/sse/status
```
Retorna numero de clientes SSE conectados.

### Logs
Railway proporciona logs en tiempo real desde el dashboard. El middleware logger registra cada request con timestamp, method y URL.

---

## Rollback

### Base de Datos
```bash
# Rollback de migracion 001
psql $DATABASE_URL -f migrations/001_rollback.sql
```

### Aplicacion
```bash
# Revertir a commit anterior
git log --oneline -5
git revert HEAD
```

---

## CI/CD

Railway despliega automaticamente al hacer push a la rama configurada (generalmente `main`).

Flujo recomendado:
1. Desarrollar en branch `feature/*`
2. Ejecutar tests localmente: `npm test`
3. Crear Pull Request
4. Merge a `main`
5. Railway despliega automaticamente

---

## Configuracion de Railway (railway.json)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health"
  }
}
```

---

## Troubleshooting

### Error: DATABASE_URL no definida
Verificar que la variable este configurada en Railway > Settings > Variables.
```bash
# Verificar desde local
echo $DATABASE_URL
```

### Error: Conexion a PostgreSQL rechazada
La configuracion de SSL usa `rejectUnauthorized: false` para Railway. Si usas otra plataforma, ajustar `server/config/database.js`.

### Tests fallan en CI
Asegurar que `DATABASE_URL` este disponible en el entorno de CI. Los tests de integracion requieren conexion real a PostgreSQL.

### Assets no minificados
Ejecutar `npm run build` y verificar que los HTML referencien `.min.js` y `.min.css`.
```bash
npm run build
# Verificar que los archivos .min existan
ls public/js/*.min.js public/css/*.min.css
```

### Error: Port already in use
```bash
# Encontrar proceso usando el puerto
lsof -i :8080
# Matar proceso
kill -9 <PID>
```

### Error: Migration failed
```bash
# Verificar conexion a BD
node -e "const {Pool}=require('pg');const p=new Pool();p.query('SELECT 1').then(()=>console.log('OK')).catch(console.error).finally(()=>p.end())"

# Re-ejecutar migraciones
node scripts/run_migration.js
```

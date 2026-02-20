# 🏆 Chogui League System

Sistema completo de gestion de liga de softball con estadisticas en tiempo real, gestion de torneos y paginas interactivas de jugadores y equipos.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Tests](https://img.shields.io/badge/tests-134%2F134-success)
![Coverage](https://img.shields.io/badge/coverage-93%25-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)

## ✨ Caracteristicas

### 🎯 Sistema de Torneos
- Multiples torneos con estadisticas aisladas
- Activacion y cambio entre torneos
- Selector de torneo en todas las vistas

### 📊 Estadisticas en Tiempo Real (SSE)
- Actualizacion automatica sin recargar
- Notificaciones push de cambios
- Hasta 100 conexiones simultaneas

### 🔄 Sincronizacion de Formularios
- Modo sumar vs reemplazar estadisticas
- Anti-duplicacion automatica
- Validacion robusta de datos

### 👤 Paginas de Jugador Modernas
- Pestanas navegables (Ofensivas/Pitcheo/Defensivas/Comparacion)
- Graficos interactivos con Chart.js
- Comparacion con lideres de liga

### 👥 Paginas de Equipo
- Estadisticas colectivas del equipo
- Top 5 bateadores y lanzadores
- Roster completo con quick stats

### ⚡ Performance Optimizado
- Cache en memoria (5 min TTL)
- Compression gzip
- Assets minificados (-40% tamano)
- 13 indices en PostgreSQL

## 🚀 Quick Start

### Requisitos
- Node.js >= 18.0.0
- PostgreSQL >= 14
- npm >= 9.0.0

### Instalacion
```bash
# Clonar repositorio
git clone https://github.com/TU_USUARIO/chogui-league-system.git
cd chogui-league-system

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Ejecutar migraciones
node scripts/run_migration.js

# Iniciar servidor
npm start
```

El servidor estara en http://localhost:8080

## 🏗️ Arquitectura

```
chogui-league-system/
├── server/              # Backend Node.js/Express
│   ├── config/          # Configuracion (DB, env, CORS)
│   ├── controllers/     # Logica HTTP (thin)
│   ├── services/        # Logica de negocio
│   ├── routes/          # Definicion de rutas
│   ├── validators/      # Validacion de datos
│   ├── utils/           # Utilidades (calculos, cache)
│   └── middleware/      # Middleware (logger, errorHandler)
├── public/              # Frontend estatico
│   ├── css/             # Estilos
│   ├── js/              # JavaScript modular
│   ├── index.html       # Pagina principal
│   ├── jugador.html     # Pagina de jugador
│   ├── equipo.html      # Pagina de equipo
│   └── admin.html       # Panel administrativo
├── migrations/          # Migraciones SQL
├── tests/               # Tests (Jest + Supertest)
├── docs/                # Documentacion
└── scripts/             # Scripts de build
```

## 📊 Base de Datos

### Tablas Principales
- **torneos** - Gestion de torneos/temporadas
- **equipos** - Equipos de la liga
- **jugadores** - Jugadores registrados
- **partidos** - Registro de partidos
- **estadisticas_ofensivas** - Stats de bateo
- **estadisticas_pitcheo** - Stats de lanzamiento
- **estadisticas_defensivas** - Stats de fildeo

### Relaciones Clave
- Estadisticas → Torneo (FK con ON DELETE CASCADE)
- Jugadores → Equipos (FK)
- Partidos → Equipos (FK local/visitante)

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm test

# Con coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

**Coverage actual:** 93.16% Statements, 92.45% Branch, 100% Functions, 93.72% Lines

## 📚 Documentacion

- [API Documentation](docs/api_documentation.md)
- [Deployment Guide](docs/deployment_guide.md)
- [Architecture Overview](docs/architecture_overview.md)
- [Testing Report](docs/testing_report.md)

## 🛠️ Stack Tecnologico

### Backend
- Node.js 18+
- Express 4.18
- PostgreSQL 14+
- JWT para autenticacion
- SSE (Server-Sent Events)

### Frontend
- HTML5 / CSS3
- JavaScript ES6+ (modular)
- Chart.js para graficos
- Fetch API para peticiones

### Testing
- Jest
- Supertest
- 134 tests, >93% coverage

### DevOps
- Railway (hosting)
- Git (control de versiones)
- npm scripts para build

## 📈 Performance

- Lighthouse Score: >90 (todas las categorias)
- Tiempo de carga: <2s
- Assets minificados: -40% tamano
- Cache en memoria: 5 min TTL
- 13 indices en PostgreSQL

## 🚀 Deploy

Ver [Deployment Guide](docs/deployment_guide.md) para instrucciones detalladas.

### Railway (Recomendado)

```bash
# Push a GitHub
git push origin main

# Conectar Railway a GitHub
# Railway detectara automaticamente el proyecto

# Variables de entorno necesarias:
DATABASE_URL=postgresql://...
JWT_SECRET=tu_secret_seguro
NODE_ENV=production
PORT=8080
```

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -m 'feat: nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto es privado.

## 👥 Autores

- **Jose Pariata** - Desarrollo y refactorizacion completa

## 🙏 Agradecimientos

- Claude AI (Anthropic) - Asistencia en desarrollo
- Railway - Hosting y base de datos

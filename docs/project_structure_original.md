# Chogui League System - Estructura Original del Proyecto

Documentado: 2026-02-08

## Arbol del Proyecto

```
chogui-league-system/
|-- server.js                          # Backend principal (4,147 lineas)
|-- database.js                        # Conexion PostgreSQL (10 lineas)
|-- package.json                       # Dependencias npm
|-- package-lock.json                  # Lock de dependencias
|-- setup-db.js                        # Script setup BD (25 lineas)
|-- test-server.js                     # Tests basicos (12 lineas)
|-- railway.json                       # Config deployment Railway
|-- railway link                       # Archivo vinculo Railway
|-- env_file.txt                       # Variables de entorno (no hay .env)
|-- .gitignore                         # Exclusiones git
|-- CHANGELOG.md                       # Registro de cambios
|-- README.md                          # Documentacion basica
|
|-- migrations/
|   |-- 20251230_add_partidos_jugados.sql
|
|-- public/                            # Frontend (archivos estaticos)
|   |-- index.html                     # Pagina principal (5,316 lineas)
|   |-- admin.html                     # Panel administrador (4,658 lineas)
|   |-- login.html                     # Pagina login (218 lineas)
|   |-- equipo.html                    # Detalle de equipo (305 lineas)
|   |-- jugador.html                   # Detalle de jugador (142 lineas)
|   |-- equipo-detalle.js              # Logica detalle equipo (619 lineas)
|   |-- jugador.js                     # Logica jugadores (654 lineas)
|   |-- jugador-detalles.js            # Logica detalle jugador (518 lineas)
|   |-- player-profile.js             # Perfil de jugador (30 lineas)
|   |-- Sse client . JS               # Cliente SSE
|   |-- Utils . JS                     # Utilidades JS
|   |-- equipo.css                     # Estilos equipo (541 lineas)
|   |-- jugador.css                    # Estilos jugador (105 lineas)
|   |-- README.md                      # Doc frontend
|   |
|   |-- images/logos/                  # Logos de equipos
|       |-- aguilas-negras.png
|       |-- caciques.png
|       |-- caribes-rd.png
|       |-- chogui-league.png
|       |-- default-logo.png
|       |-- desss.png
|       |-- furia-del-caribe..png
|       |-- guerreros-del-norte.png
|       |-- laguaira.png
|       |-- leones-dorados.png
|       |-- ls.png
|       |-- pumas-rd.png
|       |-- tigres-unidos.png
|       |-- venearstone.png
|
|-- SQL ejecutados/
|   |-- init-db.executed.sql           # Inicializacion BD
|   |-- fix-temporada-length.executed.sql
|   |-- setup-offensive-stats.executed.sql
|   |-- setup-pitching-stats.executed.sql
|   |-- setup-tournaments.executed.sql
|
|-- docs/                              # Documentacion
|   |-- database_schema_original.md
|   |-- project_structure_original.md
|
|-- backups/                           # Backups BD
    |-- db_backup_*.sql
```

## Resumen de Lineas de Codigo

| Archivo | Lineas | Descripcion |
|---|---|---|
| server.js | 4,147 | Backend monolitico (Express + API REST) |
| public/index.html | 5,316 | Frontend principal con JS inline |
| public/admin.html | 4,658 | Panel admin con JS inline |
| public/jugador.js | 654 | Logica de jugadores |
| public/equipo-detalle.js | 619 | Logica detalle equipo |
| public/equipo.css | 541 | Estilos equipo |
| public/jugador-detalles.js | 518 | Logica detalle jugador |
| public/equipo.html | 305 | HTML equipo |
| public/login.html | 218 | HTML login |
| public/jugador.html | 142 | HTML jugador |
| public/jugador.css | 105 | Estilos jugador |
| **Total** | **~17,300** | |

## Tecnologias

- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL (Railway)
- **Frontend:** HTML/CSS/JS vanilla (sin framework)
- **Autenticacion:** JWT (jsonwebtoken)
- **Deployment:** Railway
- **Dependencias npm:** express, pg, jsonwebtoken, bcryptjs, cors

## Observaciones Pre-Refactorizacion

1. **server.js monolitico:** 4,147 lineas con todas las rutas, middleware y logica de negocio
2. **HTML con JS inline:** index.html y admin.html contienen miles de lineas de JS embebido
3. **Sin .env:** Las credenciales estan hardcodeadas en database.js
4. **Sin .gitignore original:** node_modules se incluia en el proyecto
5. **Archivos con nombres irregulares:** "Sse client . JS", "Utils . JS", "railway link"
6. **Sin tests reales:** test-server.js es basico (12 lineas)

# Changelog - Chogui League System

## [Unreleased] - Refactorization v2

### Fase 1.2 - Migracion BD: temporada -> torneo_id (2026-02-08)
- Migrado campo `temporada` (VARCHAR) a `torneo_id` (INTEGER FK) en 3 tablas de estadisticas
- Creado torneo "Temporada 2024" (ID=52) para mapeo de datos existentes
- 270 registros migrados sin perdida de datos (249 ofensivos, 4 pitcheo, 17 defensivos)
- Agregados FOREIGN KEYs con ON DELETE CASCADE a tabla torneos
- Reemplazados UNIQUE constraints: (jugador_id, temporada) -> (jugador_id, torneo_id)
- Creados 3 indices de performance en torneo_id
- Script de rollback disponible en `migrations/001_rollback.sql`

### Fase 1.1 - Preparacion y Backup (2026-02-08)
- Verificacion de archivos principales del proyecto
- Creacion de backup de base de datos (8 tablas, 548 registros)
- Inicializacion de repositorio Git con commit inicial
- Documentacion del esquema de BD original
- Documentacion de estructura del proyecto original
- Creacion de rama `feature/refactorization-v2`

---

## [1.0.0] - Version Original (pre-refactorizacion)

### Estado del Sistema
- Backend monolitico: `server.js` (167 KB, ~4600 lineas)
- Frontend: HTML/JS/CSS en `public/`
- Base de datos: PostgreSQL en Railway
- Autenticacion: JWT basica
- 8 tablas en BD
- 11 equipos, 249 jugadores, 16 partidos registrados

# Torneos simultáneos y planteles

Una ficha de equipo o jugador se reutiliza en distintas ediciones. `torneo_equipos` inscribe equipos y `torneo_jugadores` asigna el equipo, número y posición de cada jugador por torneo. Un jugador solo integra un equipo dentro de una edición; puede representar otro en otra edición. No se admiten cambios de equipo si tiene actividad registrada. Los torneos finalizados conservan sus inscripciones.

## Puesta en marcha

La implementación fue comprobada en una base local de pruebas. No se ejecutó sobre la base de producción ni se crearon torneos reales.

1. Respaldar la base de datos y comprobar que las migraciones 001 a 010 están aplicadas.
2. Aplicar **solo** la migración nueva, con las variables de la instalación:

   ```sh
   MIGRATION_FILE=011_planteles_por_torneo.sql npm run migrate
   ```

3. Publicar el código y los archivos estáticos juntos después de la migración. El servidor normal es `server/index.js` (`npm start`); el servidor antiguo `server.js` no soporta este modelo.
4. En **Torneos**, marcar el torneo anterior como **Finalizado**. No eliminarlo.
5. Crear las nuevas ediciones, por ejemplo «Tradicional — nueva edición» y «Bola puesta — nueva edición».
6. Elegir una edición en el selector superior. En **Equipos y planteles del torneo**, inscribir equipos existentes y asignar jugadores existentes. Las fichas nuevas se crean desde las pestañas Equipos/Jugadores; el equipo creado se inscribe en el torneo seleccionado.
7. Activar cada edición cuando corresponda: activar una no desactiva la otra.

Cambiar el torneo en administración recarga la página para descartar formularios de la selección anterior. Las estadísticas, planteles y partidos usan el torneo elegido. Si varias ediciones están activas, una escritura sin `torneo_id` se rechaza. La lectura sin selección conserva un torneo predeterminado por compatibilidad.

## Migración e historial

La migración se ejecuta dentro de una transacción y el backfill tiene un marcador para no copiar planteles otra vez al repetirla. No borra resultados ni reinicia estadísticas.

- Las asignaciones históricas toman primero el equipo registrado en los boxscores.
- Si faltan boxscores, toma la asignación general existente de jugadores con estadísticas y la marca `legacy_revisar`. **No puede reconstruir transferencias antiguas que nunca se registraron**; esas asignaciones requieren revisión antes de publicar el historial como definitivo.
- Si un jugador aparece con dos equipos en el mismo torneo histórico, la migración se detiene sin aplicar cambios, para revisar el caso sin atribuir números al equipo equivocado.
- Los números y posiciones históricos se copian de la ficha disponible, porque no existe un registro completo anterior de cambios.
- La migración no adivina qué torneo terminó ni inscribe automáticamente jugadores en las nuevas ediciones.
- Las claves foráneas nuevas protegen futuras escrituras; se declaran `NOT VALID` para conservar filas históricas incompletas sin reescribirlas.

Consulta de revisión:

```sql
SELECT t.nombre AS torneo, j.nombre AS jugador, e.nombre AS equipo, tj.origen
FROM torneo_jugadores tj
JOIN torneos t ON t.id=tj.torneo_id
JOIN jugadores j ON j.id=tj.jugador_id
JOIN equipos e ON e.id=tj.equipo_id
WHERE tj.origen='legacy_revisar'
ORDER BY t.id,j.nombre;
```

## Validación

```sh
npm run build:local
npx jest tests/unit --runInBand
MULTITORNEO_TEST_DATABASE_URL=postgresql://127.0.0.1:55438/chogui_multitorneo_test \
  npx jest tests/integration/multitorneo.test.js --runInBand
```

La suite multitorneo requiere PostgreSQL local y una base **desechable** cuyo nombre termine en `_multitorneo_test`: reinicia su esquema `public`. Sin esa variable se omite. Comprueba backfill idempotente, equipos compartidos, diferentes planteles, activación simultánea, separación de estadísticas/posiciones/premios, validación de boxscore, protección del historial y playoffs. Los tests generales de API requieren su propia configuración de base y JWT.

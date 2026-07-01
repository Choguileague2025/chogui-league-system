# Plan de Trabajo: Departamentos Estadísticos Públicos

## Objetivo
Construir una capa pública de estadísticas más clara y más útil que la competencia, organizada por departamentos reales:

- Resumen
- Ofensiva
- Pitcheo
- Defensa

## Problema actual

- La vista pública concentra casi todo dentro de "Líderes".
- Solo existe una tabla completa de bateo.
- Pitcheo y defensa no tienen un departamento propio visible y estable.
- Falta navegación clara por áreas estadísticas.
- La lectura sirve para fanáticos, pero no todavía para managers, scouting o archivo técnico.

## Resultado esperado de la Fase 1

La pestaña pública de estadísticas debe quedar convertida en un hub con:

1. Resumen
   - líderes principales
   - podio y exploración rápida
   - mejores por posición defensiva

2. Ofensiva
   - tabla completa
   - filtro por equipo
   - filtro por posición
   - búsqueda por nombre

3. Pitcheo
   - tabla completa
   - filtro por equipo
   - búsqueda por nombre

4. Defensa
   - tabla completa
   - filtro por equipo
   - filtro por posición
   - búsqueda por nombre
   - mejores por posición

## Campos recomendados

### Ofensiva
- Jugador
- Equipo
- Posición
- PA
- AB
- H
- 1B
- 2B
- 3B
- HR
- RBI
- R
- BB
- SO
- SB
- CS
- AVG
- OBP
- SLG
- OPS
- ISO
- TB

### Pitcheo
- Jugador
- Equipo
- IP
- H
- ER
- BB
- K
- HR-A
- G
- P
- SV
- ERA
- WHIP

### Defensa
- Jugador
- Equipo
- Posición
- PO
- A
- E
- DP
- PB
- CH
- FLD%

## Lógica funcional

- El torneo se controla desde el selector público global.
- La data debe refrescar automáticamente al cambiar torneo.
- Los filtros internos no cambian el torneo; solo refinan la vista actual.
- Si un departamento no tiene data, debe mostrar un estado vacío claro.

## Valor frente a la competencia

- Organización por departamentos reales
- Mejor legibilidad
- Mejor filtro para scouting
- Mejor experiencia móvil
- Mejor base para futuras fases de juego a juego y scouting profundo

## Siguientes fases después de esta

### Fase 2
Reglas de elegibilidad visibles:
- mínimo de turnos para AVG y OPS
- mínimo de innings para ERA y WHIP
- mínimo de chances para defensa

### Fase 3
Defensa fuerte:
- líderes defensivos por posición
- campeones defensivos mejor explicados
- más contexto técnico del fildeo

### Fase 4
Juego a juego y scouting:
- rendimiento por rival
- rendimiento por torneo
- tendencias
- últimos juegos

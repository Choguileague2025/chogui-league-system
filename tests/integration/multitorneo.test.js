/** Run only against a disposable local PostgreSQL database named *_multitorneo_test. */
const fs = require('fs');
const path = require('path');
const databaseUrl = process.env.MULTITORNEO_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
jest.mock('../../server/config/database', () => {
    const { Pool } = require('pg');
    return new Pool({ connectionString: process.env.MULTITORNEO_TEST_DATABASE_URL, ssl: false });
});
const pool = require('../../server/config/database');
const planteles = require('../../server/services/planteles.service');
const torneos = require('../../server/services/torneos.service');
const stats = require('../../server/services/estadisticas.service');
const partidos = require('../../server/controllers/partidos.controller');
const jugadores = require('../../server/controllers/jugadores.controller');
const dashboard = require('../../server/controllers/dashboard.controller');
const campeones = require('../../server/services/campeones.service');
const playoffs = require('../../server/services/playoffs.service');
const migration = name => fs.readFileSync(path.join(__dirname, '../../migrations', name), 'utf8');
async function call(fn, { params = {}, query = {}, body = {} } = {}) {
    let result, status = 200;
    await fn({params,query,body}, { json: value => { result=value; }, status: value => {status=value; return {json:value=>{result=value;}};} }, error=>{throw error;});
    if (status >= 400) throw Object.assign(new Error(result.error),{statusCode:status});
    return result;
}
(enabled ? describe : describe.skip)('Torneos simultáneos: aislamiento e historial con PostgreSQL', () => {
    beforeAll(async () => {
        const url = new URL(databaseUrl);
        if (!['127.0.0.1','localhost'].includes(url.hostname) || !url.pathname.endsWith('_multitorneo_test')) throw new Error('Use una base local desechable *_multitorneo_test');
        await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
            CREATE TABLE equipos(id SERIAL PRIMARY KEY,nombre TEXT,manager TEXT,ciudad TEXT,fecha_creacion TIMESTAMP DEFAULT NOW());
            CREATE TABLE jugadores(id SERIAL PRIMARY KEY,nombre TEXT,equipo_id INT REFERENCES equipos(id),numero INT,posicion VARCHAR(10),created_at TIMESTAMP DEFAULT NOW());
            CREATE TABLE torneos(id SERIAL PRIMARY KEY,nombre TEXT,activo BOOLEAN DEFAULT false,estado TEXT DEFAULT 'preparacion',visible_publico BOOLEAN DEFAULT true,fecha_creacion TIMESTAMP DEFAULT NOW(),fecha_inicio TIMESTAMP DEFAULT NOW(),total_juegos INT DEFAULT 22,cupos_playoffs INT DEFAULT 8);
            CREATE TABLE partidos(id SERIAL PRIMARY KEY,torneo_id INT REFERENCES torneos(id),equipo_local_id INT REFERENCES equipos(id),equipo_visitante_id INT REFERENCES equipos(id),estado TEXT DEFAULT 'programado',fecha_partido DATE,hora TIME,carreras_local INT,carreras_visitante INT,innings_jugados INT DEFAULT 7,created_at TIMESTAMP DEFAULT NOW());`);
        const fields = {
            ofensivas:'at_bats hits doubles triples home_runs rbi runs walks strikeouts stolen_bases caught_stealing hit_by_pitch sacrifice_flies sacrifice_hits',
            pitcheo:'innings_pitched hits_allowed earned_runs strikeouts walks_allowed home_runs_allowed wins losses saves',
            defensivas:'putouts assists errors double_plays passed_balls chances'
        };
        for (const [type, columns] of Object.entries(fields)) await pool.query(`CREATE TABLE estadisticas_${type}(id SERIAL PRIMARY KEY,jugador_id INT REFERENCES jugadores(id),torneo_id INT REFERENCES torneos(id),${columns.split(' ').map(c=>`${c} NUMERIC DEFAULT 0`).join(',')},fecha_actualizacion TIMESTAMP,UNIQUE(jugador_id,torneo_id))`);
        await pool.query(migration('006_boxscore_historico.sql'));
        await pool.query(migration('009_torneo_criterios_elegibilidad.sql'));
        await pool.query(`INSERT INTO equipos(nombre) VALUES ('Tigres'),('Halcones'),('Solo tradicional');
            INSERT INTO jugadores(nombre,equipo_id,numero,posicion) VALUES ('Juan',1,10,'SS'),('Pedro',1,20,'P'),('Nuevo',NULL,30,'C');
            INSERT INTO torneos(nombre,estado) VALUES ('Anterior','finalizado'),('Tradicional nuevo','preparacion'),('Bola puesta','preparacion');
            INSERT INTO estadisticas_ofensivas(jugador_id,torneo_id,at_bats,hits) VALUES (1,1,10,4);
            INSERT INTO partidos(torneo_id,equipo_local_id,equipo_visitante_id,estado,fecha_partido,carreras_local,carreras_visitante) VALUES (1,1,2,'finalizado','2026-01-01',5,2);
            INSERT INTO partido_jugador_ofensiva(partido_id,jugador_id,equipo_id,at_bats,hits) VALUES (1,1,1,10,4);`);
        await pool.query(migration('011_planteles_por_torneo.sql'));
    });
    afterAll(async()=>{await pool.end();});
    test('migra historial usando boxscore y no rellena ediciones nuevas al repetir',async()=>{
        expect((await planteles.jugadores(1))[0]).toMatchObject({nombre:'Juan',equipo_id:1,origen:'boxscore'});
        await pool.query(migration('011_planteles_por_torneo.sql'));
        expect(await planteles.jugadores(2)).toEqual([]);
        expect(await planteles.equipos(3)).toEqual([]);
    });
    test('mismo equipo en dos torneos y mismo jugador en equipos distintos',async()=>{
        for(const [t,e] of [[2,1],[2,2],[2,3],[3,1],[3,2]]) await planteles.inscribirEquipo(t,e);
        await planteles.inscribirJugador(2,1,{equipo_id:1,numero:10,posicion:'SS'});
        await planteles.inscribirJugador(3,1,{equipo_id:2,numero:7,posicion:'CF'});
        await planteles.inscribirJugador(3,2,{equipo_id:1,numero:20,posicion:'P'});
        expect((await planteles.jugadores(2,1)).map(j=>j.id)).toEqual([1]);
        expect((await planteles.jugadores(3,1)).map(j=>j.id)).toEqual([2]);
        expect((await planteles.jugadores(3,2))[0]).toMatchObject({id:1,numero:7,posicion:'CF'});
        await expect(planteles.inscribirJugador(3,3,{equipo_id:3})).rejects.toMatchObject({statusCode:409});
    });
    test('activar dos torneos no desactiva al primero; exige elección al guardar',async()=>{
        await torneos.activarTorneo(2); await torneos.activarTorneo(3);
        expect((await pool.query('SELECT id FROM torneos WHERE activo ORDER BY id')).rows.map(t=>t.id)).toEqual([2,3]);
        await expect(torneos.resolveTorneoEscritura()).rejects.toMatchObject({statusCode:400});
        expect(await torneos.resolveTorneoEscritura(3)).toBe(3);
        expect((await pool.query('SELECT jugador_id FROM estadisticas_ofensivas WHERE torneo_id=2')).rows.map(j=>j.jugador_id)).toEqual([1]);
    });
    test('estadísticas y posiciones no se mezclan; no admite jugador ajeno',async()=>{
        await stats.actualizarOfensivas(1,2,{at_bats:10,hits:3},'replace');
        await stats.actualizarOfensivas(1,3,{at_bats:10,hits:8},'replace');
        expect((await stats.obtenerOfensivas({torneo_id:2}))[0]).toMatchObject({equipo_id:1,equipo_nombre:'Tigres',posicion:'SS'});
        expect((await stats.obtenerOfensivas({torneo_id:3,jugador_id:1}))[0]).toMatchObject({equipo_id:2,equipo_nombre:'Halcones',posicion:'CF'});
        expect(await stats.obtenerOfensivas({torneo_id:3,equipo_id:1,jugador_id:1})).toEqual([]);
        await expect(stats.actualizarOfensivas(3,3,{hits:1})).rejects.toMatchObject({statusCode:409});
        const standings=await call(dashboard.obtenerPosiciones,{query:{torneo_id:3}});
        expect(standings.map(e=>e.equipo_id).sort()).toEqual([1,2]);
        for(const type of ['Pitcheo','Defensivas']) {
            await stats[`actualizar${type}`](1,3,{},'replace');
            expect((await stats[`obtener${type}`]({torneo_id:3,jugador_id:1}))[0].equipo_id).toBe(2);
        }
    });
    test('protege planteles con actividad y torneos finalizados',async()=>{
        await expect(planteles.inscribirJugador(3,1,{equipo_id:1})).rejects.toMatchObject({statusCode:409});
        await expect(planteles.retirarJugador(3,1)).rejects.toMatchObject({statusCode:409});
        await expect(planteles.inscribirJugador(1,1,{equipo_id:2})).rejects.toMatchObject({statusCode:409});
        await expect(stats.actualizarOfensivas(1,1,{hits:99})).rejects.toMatchObject({statusCode:409});
        expect(Number((await stats.obtenerOfensivas({torneo_id:1,jugador_id:1}))[0].hits)).toBe(4);
    });
    test('ficha del jugador respeta torneo seleccionado',async()=>{
        const one=await call(jugadores.obtenerPorId,{params:{id:1},query:{torneo_id:2}});
        const two=await call(jugadores.obtenerPorId,{params:{id:1},query:{torneo_id:3}});
        expect(one.equipo_id).toBe(1); expect(two.equipo_id).toBe(2);
        const listado=await call(jugadores.obtenerTodos,{query:{torneo_id:3,equipo_id:1}});
        expect(listado.jugadores.map(j=>j.id)).toEqual([2]);
    });
    test('partidos rechazan equipos ajenos y boxscore rechaza jugadores de otro plantel',async()=>{
        const body={torneo_id:3,equipo_local_id:1,equipo_visitante_id:3,estado:'programado',fecha_partido:'2026-09-20',carreras_local:0,carreras_visitante:0,innings_jugados:7};
        await expect(call(partidos.crear,{body})).rejects.toMatchObject({statusCode:409});
        const game=await call(partidos.crear,{body:{...body,equipo_visitante_id:2}});
        await expect(call(partidos.guardarBoxscore,{params:{id:game.id},body:{ofensiva:[{jugador_id:1,equipo_id:1,at_bats:2,hits:1}]}})).rejects.toMatchObject({statusCode:409});
        await call(partidos.guardarBoxscore,{params:{id:game.id},body:{ofensiva:[{jugador_id:1,equipo_id:2,at_bats:2,hits:1}]}});
        const row=(await pool.query('SELECT * FROM partido_jugador_ofensiva WHERE partido_id=$1',[game.id])).rows[0];
        expect(row).toMatchObject({torneo_id:3,jugador_id:1,equipo_id:2});
        await expect(call(partidos.actualizar,{params:{id:game.id},body:{...body,equipo_visitante_id:2,torneo_id:2}})).rejects.toMatchObject({statusCode:409});
    });
    test('lee premios y archivo sin depender del equipo general',async()=>{
        await campeones.obtenerPalmaresJugador(1);
        await campeones.obtenerLideresHistoricosCategorias();
        await call(dashboard.obtenerRecordsHistoricos);
        await campeones.obtenerCampeonesPorPosicion(3);
        await campeones.obtenerPremiosOficialesTorneo(3);
        await call(jugadores.obtenerHistorico,{params:{id:1}});
        expect((await stats.obtenerOfensivas({torneo_id:'todos',equipo_id:2,jugador_id:1}))[0].equipo_id).toBe(2);
    });
    test('las claves foráneas también rechazan cruces fuera de la API', async()=>{
        await expect(pool.query('INSERT INTO partidos(torneo_id,equipo_local_id,equipo_visitante_id) VALUES (3,1,3)')).rejects.toMatchObject({code:'23503'});
        await expect(pool.query('INSERT INTO estadisticas_ofensivas(torneo_id,jugador_id,hits) VALUES (3,3,1)')).rejects.toMatchObject({code:'23503'});
    });
    test('playoffs solo toman equipos inscritos y leer no crea un bracket',async()=>{
        expect(await playoffs.getBracket(3)).toBeNull();
        await playoffs.initializeDefaultBracket(3);
        const result=await playoffs.getBracket(3);
        expect(result.bracket.torneo_id).toBe(3);
        expect(result.games.every(g=>[null,1,2].includes(g.equipo_local_id)&&[null,1,2].includes(g.equipo_visitante_id))).toBe(true);
    });
});

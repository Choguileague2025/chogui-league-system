// Catálogo único; cada inscripción pertenece exclusivamente al torneo seleccionado.
(() => {
    const root = document.querySelector('#torneos');
    if (!root) return;
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
        <h3>Equipos y planteles del torneo</h3>
        <p id="plantelContext" role="status">Selecciona un torneo en la barra superior.</p>
        <div class="form-group"><label for="plantelCatalogEquipo">Inscribir equipo existente</label>
            <select id="plantelCatalogEquipo"></select><button type="button" class="btn-primary" id="inscribirEquipoTorneo">Inscribir equipo</button></div>
        <div class="form-group"><label for="plantelEquipo">Equipo inscrito</label><select id="plantelEquipo"></select>
            <button type="button" class="btn-secondary" id="retirarEquipoTorneo">Retirar equipo sin partidos ni jugadores</button></div>
        <div class="form-group"><label for="plantelBusqueda">Buscar jugador del catálogo</label><input id="plantelBusqueda" placeholder="Nombre del jugador" autocomplete="off">
            <label for="plantelJugador">Jugador existente</label><select id="plantelJugador"></select></div>
        <div class="form-group"><label for="plantelNumero">Número en este torneo</label><input id="plantelNumero" type="number" min="0">
            <label for="plantelPosicion">Posición en este torneo</label><select id="plantelPosicion"><option value="">Sin posición</option>${['C','1B','2B','3B','SS','SF','LF','CF','RF','P','UTIL','DH'].map(p=>`<option>${p}</option>`).join('')}</select>
            <button type="button" class="btn-primary" id="inscribirJugadorTorneo">Guardar inscripción del jugador</button></div>
        <p>Para crear una ficha nueva usa las pestañas Equipos o Jugadores. Para participar en otra edición, reutiliza aquí esa ficha. Los jugadores con actividad conservan su equipo.</p>
        <div class="table-container"><table><thead><tr><th>Jugador</th><th>Número</th><th>Posición</th><th>Origen</th><th>Acciones</th></tr></thead><tbody id="plantelRows"></tbody></table></div>
        <p id="plantelMessage" role="status" aria-live="polite"></p>`;
    root.appendChild(card);
    const $ = name => document.getElementById(name);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let torneoId, members = [], searchVersion = 0;
    async function api(url, method = 'GET', body) {
        const response = await fetch(url, {method, ...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
        return data;
    }
    function options(el, rows, label = 'nombre') { el.replaceChildren(new Option('Seleccionar…','')); rows.forEach(row=>el.add(new Option(row[label],row.id))); }
    async function search() {
        const version = ++searchVersion;
        const data = await api(`/api/jugadores?limit=100&search=${encodeURIComponent($('plantelBusqueda').value)}`);
        if (version === searchVersion) options($('plantelJugador'), data.jugadores.map(j=>({...j,nombre:`${j.nombre} · ficha ${j.id}`})));
    }
    async function roster() {
        if (!torneoId) return;
        const team = $('plantelEquipo').value;
        members = team ? await api(`/api/torneos/${torneoId}/plantel?equipo_id=${team}`) : [];
        $('plantelRows').innerHTML = members.length ? members.map(j=>`<tr><td>${esc(j.nombre)}</td><td>${esc(j.numero)}</td><td>${esc(j.posicion)}</td><td>${j.origen === 'legacy_revisar' ? 'Plantel anterior: revisar' : 'Inscrito'}</td><td><button type="button" class="btn-secondary" data-retirar-jugador="${j.id}">Retirar</button></td></tr>`).join('') : '<tr><td colspan="5">Sin jugadores inscritos en este equipo.</td></tr>';
    }
    async function refresh() {
        const list = await api('/api/torneos');
        const saved = sessionStorage.getItem('adminTorneoId');
        const t = list.find(t=>String(t.id)===saved) || list.find(t=>t.activo) || list[0];
        torneoId = t?.id;
        if (!t) return;
        $('plantelContext').textContent = `${t.nombre} · ${t.estado}. Las inscripciones se guardan únicamente en este torneo.`;
        const [catalog, enrolled] = await Promise.all([api('/api/equipos'),api(`/api/torneos/${torneoId}/equipos`)]);
        const selected = $('plantelEquipo').value;
        options($('plantelCatalogEquipo'), catalog.filter(e=>!enrolled.some(x=>x.id===e.id)));
        options($('plantelEquipo'), enrolled);
        $('plantelEquipo').value = enrolled.some(e=>String(e.id)===selected) ? selected : enrolled[0]?.id || '';
        await roster();
    }
    async function run(work) {
        try { $('plantelMessage').textContent='Guardando…'; await work(); await refresh(); await cargarEquipos(); await cargarJugadores(); $('plantelMessage').textContent='Guardado correctamente.'; }
        catch(err) { $('plantelMessage').textContent=err.message; }
    }
    $('inscribirEquipoTorneo').onclick = () => run(()=>api(`/api/torneos/${torneoId}/equipos`,'POST',{equipo_id:$('plantelCatalogEquipo').value}));
    $('retirarEquipoTorneo').onclick = () => run(()=>api(`/api/torneos/${torneoId}/equipos/${$('plantelEquipo').value}`,'DELETE'));
    $('inscribirJugadorTorneo').onclick = () => run(()=>api(`/api/torneos/${torneoId}/plantel/${$('plantelJugador').value}`,'PUT',{equipo_id:$('plantelEquipo').value,numero:$('plantelNumero').value,posicion:$('plantelPosicion').value}));
    $('plantelEquipo').onchange = () => roster().catch(err=>$('plantelMessage').textContent=err.message);
    let debounce;
    $('plantelBusqueda').oninput = () => { clearTimeout(debounce); debounce=setTimeout(()=>search().catch(err=>$('plantelMessage').textContent=err.message),250); };
    document.addEventListener('click', event => {
        const remove = event.target.closest('[data-retirar-jugador]');
        if (remove) run(()=>api(`/api/torneos/${torneoId}/plantel/${remove.dataset.retirarJugador}`,'DELETE'));
        const finish = event.target.closest('[data-finalizar-torneo]');
        if (finish && confirm('¿Finalizar este torneo y conservar su historial?')) run(async()=>{ await api(`/api/torneos/${finish.dataset.finalizarTorneo}`,'PUT',{estado:'finalizado'}); await cargarTorneos(); await AdminTournamentModule.init(); });
    });
    window.addEventListener('planteles-refresh', () => refresh().catch(err=>$('plantelMessage').textContent=err.message));
    Promise.all([refresh(),search()]).catch(err=>$('plantelMessage').textContent=err.message);
})();

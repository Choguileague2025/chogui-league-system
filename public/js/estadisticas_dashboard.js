(function () {
    'use strict';
    const state = { category: 'bateo', search: '', page: 1, sort: null, direction: -1, batting: [], pitching: [], defense: [], standings: [], games: [], official: null, loading: false };
    let requestToken = 0;
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const num = (value) => Number(value) || 0;
    const decimal = (value, places = 3) => Number.isFinite(Number(value)) ? (places === 3 ? Number(value).toFixed(places).replace(/^0(?=\.)/, '') : Number(value).toFixed(places)) : '—';
    const tableValues = {
        bateo: [['jugador_nombre','Jugador'],['equipo_nombre','Equipo'],['at_bats','VB'],['hits','H'],['avg','AVG'],['home_runs','HR'],['rbi','RBI'],['runs','CA'],['obp','OBP'],['slg','SLG'],['ops','OPS']],
        pitcheo: [['jugador_nombre','Jugador'],['equipo_nombre','Equipo'],['innings_pitched','IP'],['wins','G'],['losses','P'],['strikeouts','K'],['hits_allowed','H'],['walks_allowed','BB'],['era','ERA'],['whip','WHIP']],
        defensa: [['jugador_nombre','Jugador'],['equipo_nombre','Equipo'],['posicion','Pos.'],['putouts','PO'],['assists','A'],['errors','E'],['double_plays','DP'],['chances','CH'],['fielding_percentage','FLD%']],
        equipos: [['equipo_nombre','Equipo'],['pj','JJ'],['pg','G'],['pp','P'],['cf','CA'],['ce','CP'],['dif','DIF'],['porcentaje','PCT']]
    };
    const labels = {bateo:'Bateo',pitcheo:'Pitcheo',defensa:'Defensa',equipos:'Equipos'};
    const defaultSort = {bateo:'avg',pitcheo:'era',defensa:'fielding_percentage',equipos:'porcentaje'};
    const playerAvatar = (position) => {
        const pos = String(position || '').toUpperCase();
        return `/images/avatars/player-${pos === 'P' ? 'pitcher' : pos === 'C' ? 'catcher' : ['1B','2B','3B','SS'].includes(pos) ? 'infield' : ['LF','CF','RF'].includes(pos) ? 'outfield' : 'utility'}.svg`;
    };
    const set = (id, html) => { const node = document.getElementById(id); if (node) node.innerHTML = html; };
    const tournamentSelect = () => document.getElementById('indexTournamentSelect');
    const selectedId = () => tournamentSelect()?.value || '';
    const query = () => `torneo_id=${encodeURIComponent(selectedId() || 'todos')}`;
    const get = async (path) => { const response = await fetch(path, {headers:{Accept:'application/json'}}); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); };
    const list = (value) => Array.isArray(value) ? value : Array.isArray(value?.partidos) ? value.partidos : [];
    const profileUrl = (row) => `jugador.html?id=${encodeURIComponent(row.jugador_id || row.id)}${selectedId() && selectedId() !== 'todos' ? `&torneo_id=${encodeURIComponent(selectedId())}` : ''}`;
    const teamUrl = (row) => `equipo.html?id=${encodeURIComponent(row.equipo_id || row.id)}${selectedId() && selectedId() !== 'todos' ? `&torneo_id=${encodeURIComponent(selectedId())}` : ''}`;
    const logo = (id) => id ? `<img src="/api/equipos/${encodeURIComponent(id)}/logo" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
    const filled = (value) => value == null || value === '' ? '—' : esc(value);
    const fieldingPct = (row) => { const chances = num(row.putouts) + num(row.assists) + num(row.errors); return chances ? (num(row.putouts) + num(row.assists)) / chances : num(row.fielding_percentage); };

    function syncTournament() {
        const global = tournamentSelect(), local = document.getElementById('statsDashboardTournament');
        if (!global || !local) return;
        const signature = Array.from(global.options).map((option) => `${option.value}:${option.textContent}`).join('|');
        if (local.dataset.options !== signature) {
            local.innerHTML = Array.from(global.options).map((option) => `<option value="${esc(option.value)}">${esc(option.textContent)}</option>`).join('');
            local.dataset.options = signature;
        }
        local.value = global.value;
        local.disabled = global.disabled;
    }

    async function getAllGames() {
        const first = await get(`/api/partidos?page=1&${query()}`);
        const games = list(first);
        const pages = Math.min(10, num(first?.pagination?.pages) || 1);
        if (pages > 1) {
            const rest = await Promise.all(Array.from({length:pages-1}, (_, index) => get(`/api/partidos?page=${index+2}&${query()}`).catch(() => [])));
            rest.forEach((page) => games.push(...list(page)));
        }
        return games;
    }

    async function refresh() {
        const token = ++requestToken;
        syncTournament();
        if (!selectedId()) return;
        state.loading = true;
        try {
            const paths = [`/api/estadisticas-ofensivas?min_at_bats=1&${query()}`, `/api/estadisticas-pitcheo?${query()}`, `/api/estadisticas-defensivas?${query()}`, `/api/standings?${query()}`];
            const officialRequest = selectedId() === 'todos' ? Promise.resolve(null) : get(`/api/dashboard/premios-oficiales?${query()}`).catch(() => null);
            const values = await Promise.all([...paths.map((path) => get(path).catch(() => [])), getAllGames().catch(() => []), officialRequest]);
            if (token !== requestToken) return;
            [state.batting, state.pitching, state.defense, state.standings, state.games] = values.slice(0,5).map(list);
            state.official = values[5];
            state.page = 1;
            render();
        } catch (error) {
            console.warn('[Estadísticas] No se pudieron cargar los datos:', error);
            set('statsDashboardTable', '<h2>Tabla de estadísticas</h2><p class="stats-dashboard-muted">No se pudieron cargar los datos del torneo.</p>');
        } finally { if (token === requestToken) state.loading = false; }
    }

    function leaderCards() {
        const official = state.official?.categorias;
        const leader = (section, key) => Array.isArray(official?.[section]?.[key]) ? official[section][key][0] : null;
        const cards = [
            ['PROMEDIO DE BATEO (AVG)',leader('ofensiva','avg'), 'avg', 3],
            ['CUADRANGULARES (HR)',leader('ofensiva','home_runs'), 'home_runs', 0],
            ['IMPULSADAS (RBI)',leader('ofensiva','rbi'), 'rbi', 0],
            ['EFECTIVIDAD (ERA)',leader('pitcheo','era'), 'era', 2]
        ];
        const html = cards.map(([label,row,key,digits]) => `<article class="stats-leader">${row ? `<a href="${profileUrl(row)}"><small>${label}</small><div class="stats-leader-body"><img class="stats-leader-avatar" src="${playerAvatar(row.posicion)}" alt="" loading="lazy"><div><strong>${esc(row.jugador_nombre || 'Jugador')}</strong><span>${esc(row.equipo_nombre || 'Equipo')}</span><b>${decimal(row[key],digits)}</b></div>${logo(row.equipo_id)}</div></a>` : `<small>${label}</small><p class="stats-dashboard-muted">Sin líder elegible todavía</p>`}</article>`).join('');
        set('statsDashboardLeaders', `<div class="stats-dashboard-heading"><h2>Líderes del torneo</h2><button type="button" data-stats-open-advanced>Ver criterios oficiales →</button></div><div class="stats-leaders-grid">${html}</div>`);
        return cards;
    }

    function sourceRows() { return state.category === 'bateo' ? state.batting : state.category === 'pitcheo' ? state.pitching : state.category === 'defensa' ? state.defense : state.standings; }
    function sortedRows() {
        const term = state.search.trim().toLocaleLowerCase('es');
        const rows = sourceRows().filter((row) => !term || `${row.jugador_nombre || ''} ${row.equipo_nombre || ''} ${row.posicion || ''}`.toLocaleLowerCase('es').includes(term));
        const key = state.sort || defaultSort[state.category];
        const direction = state.sort ? state.direction : state.category === 'pitcheo' ? 1 : -1;
        rows.sort((a,b) => {
            const av = key === 'fielding_percentage' ? fieldingPct(a) : key === 'era' && !num(a.innings_pitched) ? Number.POSITIVE_INFINITY : a[key];
            const bv = key === 'fielding_percentage' ? fieldingPct(b) : key === 'era' && !num(b.innings_pitched) ? Number.POSITIVE_INFINITY : b[key];
            if (av == null && bv != null) return 1;
            if (bv == null && av != null) return -1;
            if (typeof av === 'string' && isNaN(Number(av))) return String(av).localeCompare(String(bv),'es') * direction;
            return (num(av) - num(bv)) * direction;
        });
        return rows;
    }
    function cell(row,key) {
        if (key === 'jugador_nombre') return `<a class="stats-person-link" href="${profileUrl(row)}"><img src="${playerAvatar(row.posicion)}" alt="" loading="lazy"><span>${esc(row.jugador_nombre || 'Jugador')}</span></a>`;
        if (key === 'equipo_nombre') return `<a class="stats-team-link" href="${teamUrl(row)}">${logo(row.equipo_id)}<span>${esc(row.equipo_nombre || 'Equipo')}</span></a>`;
        if (key === 'fielding_percentage') return decimal(fieldingPct(row),3);
        if (['avg','obp','slg','ops'].includes(key)) return decimal(row[key],3);
        if (['era','whip'].includes(key)) return decimal(row[key],2);
        if (key === 'porcentaje') return `${num(row[key]).toFixed(2)}%`;
        if (key === 'dif') return `${num(row[key]) > 0 ? '+' : ''}${filled(row[key])}`;
        if (key === 'chances') return num(row.chances) || (num(row.putouts) + num(row.assists) + num(row.errors));
        return filled(row[key]);
    }
    function renderTable() {
        const rows = sortedRows(), size = 10, pages = Math.max(1,Math.ceil(rows.length/size));
        state.page = Math.min(state.page,pages);
        const columns = tableValues[state.category];
        const start = (state.page-1)*size;
        const header = columns.map(([key,label]) => `<th><button type="button" data-stats-sort="${key}" aria-label="Ordenar por ${esc(label)}">${esc(label)}${(state.sort || defaultSort[state.category]) === key ? ' ↕' : ''}</button></th>`).join('');
        const body = rows.slice(start,start+size).map((row,index) => `<tr><td class="stats-rank">${start+index+1}</td>${columns.map(([key]) => `<td>${cell(row,key)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${columns.length+1}" class="stats-empty-row">Sin datos para esta búsqueda.</td></tr>`;
        const pagesHtml = Array.from({length:Math.min(5,pages)},(_,index) => { const page = pages <= 5 ? index+1 : Math.min(Math.max(state.page-2,1),pages-4)+index; return `<button type="button" data-stats-page="${page}" ${page===state.page?'class="active" aria-current="page"':''}>${page}</button>`; }).join('');
        set('statsDashboardTable', `<div class="stats-dashboard-heading"><h2>Tabla completa de ${labels[state.category]}</h2><button type="button" id="statsDashboardExport">Exportar CSV ↗</button></div><div class="stats-table-scroll"><table class="stats-dashboard-table"><thead><tr><th>#</th>${header}</tr></thead><tbody>${body}</tbody></table></div><div class="stats-table-footer"><span>Mostrando ${rows.length ? start+1 : 0}–${Math.min(start+size,rows.length)} de ${rows.length} ${state.category==='equipos'?'equipos':'registros'}</span><nav aria-label="Páginas de estadísticas"><button type="button" data-stats-page="${state.page-1}" ${state.page===1?'disabled':''}>‹</button>${pagesHtml}<button type="button" data-stats-page="${state.page+1}" ${state.page===pages?'disabled':''}>›</button></nav></div>`);
    }

    function renderSidebar(cards) {
        const finished = state.games.filter((game) => game.estado === 'finalizado' && game.carreras_local != null && game.carreras_visitante != null);
        const totalRuns = finished.reduce((sum,game) => sum + num(game.carreras_local) + num(game.carreras_visitante),0);
        const hits = state.batting.reduce((sum,row) => sum + num(row.hits),0);
        const homeRuns = state.batting.reduce((sum,row) => sum + num(row.home_runs),0);
        const avgRuns = finished.length ? (totalRuns/finished.length).toFixed(1) : '—';
        set('statsDashboardTrends', `<h2>Panorama de la liga</h2><div class="stats-trend-list"><div><strong>${finished.length}</strong><span>Partidos finalizados</span></div><div><strong>${totalRuns}</strong><span>Carreras registradas · ${avgRuns} por juego</span></div><div><strong>${hits}</strong><span>Hits registrados</span></div><div><strong>${homeRuns}</strong><span>Cuadrangulares registrados</span></div></div>`);
        const spotlight = cards[1]?.[1] || cards[0]?.[1];
        set('statsDashboardSpotlight', `<h2>Jugador destacado</h2>${spotlight ? `<a href="${profileUrl(spotlight)}" class="stats-spotlight-player"><img src="${playerAvatar(spotlight.posicion)}" alt="" loading="lazy"><span><strong>${esc(spotlight.jugador_nombre || 'Jugador')}</strong><small>${esc(spotlight.equipo_nombre || 'Equipo')}</small><b>${num(spotlight.home_runs)} HR · ${num(spotlight.rbi)} RBI · ${decimal(spotlight.avg)} AVG</b></span></a>` : '<p class="stats-dashboard-muted">Sin jugadores destacados todavía.</p>'}`);
        const weeks = new Map();
        finished.forEach((game) => {
            const raw = String(game.fecha_partido || '').slice(0,10); if (!raw) return;
            const date = new Date(`${raw}T12:00:00`); if (Number.isNaN(date.getTime())) return;
            const day = (date.getDay()+6)%7; date.setDate(date.getDate()-day);
            const key = date.toISOString().slice(0,10);
            weeks.set(key,(weeks.get(key)||0)+num(game.carreras_local)+num(game.carreras_visitante));
        });
        const recent = [...weeks.entries()].sort((a,b) => a[0].localeCompare(b[0])).slice(-6);
        const maximum = Math.max(...recent.map(([,count]) => count),1);
        set('statsDashboardProduction', `<h2>Producción de carreras</h2><p class="stats-dashboard-muted">Semanas con partidos registrados</p>${recent.length ? `<div class="stats-week-chart">${recent.map(([date,count]) => `<div title="Semana del ${esc(date)}: ${count} carreras"><strong>${count}</strong><span class="stats-week-bar" style="height:${Math.max(8,count/maximum*100)}%"></span><small>${new Date(`${date}T12:00:00`).toLocaleDateString('es-AR',{day:'2-digit',month:'short'})}</small></div>`).join('')}</div>` : '<p class="stats-dashboard-muted">Aún no hay resultados para graficar.</p>'}`);
    }
    function render() {
        const cards = leaderCards(); renderTable(); renderSidebar(cards);
        document.querySelectorAll('[data-dashboard-category]').forEach((button) => { const active = button.dataset.dashboardCategory===state.category; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
    }
    function exportCsv() {
        const columns = tableValues[state.category];
        const quote = (value) => `"${String(value ?? '').replace(/"/g,'""')}"`;
        const csv = [columns.map(([,label]) => quote(label)).join(','),...sortedRows().map((row) => columns.map(([key]) => quote(row[key])).join(','))].join('\r\n');
        const url = URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));
        const anchor = document.createElement('a'); anchor.href=url; anchor.download=`chogui-${state.category}-${selectedId()||'torneo'}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    }
    function showAdvanced() {
        const panel = document.getElementById('statisticsAdvanced'), button = document.getElementById('statsDashboardMore');
        const open = panel.hidden;
        panel.hidden = !open; button.setAttribute('aria-expanded',String(open)); button.textContent = open ? 'Ocultar análisis completo ↑' : 'Ver análisis completo y criterios oficiales ↓';
        if (open) panel.scrollIntoView({behavior:'smooth',block:'start'});
    }
    function connectSse() {
        let tries = 0;
        const timer = setInterval(() => {
            tries++;
            if (typeof SSEModule !== 'undefined' && SSEModule.connection) {
                SSEModule.connection.addEventListener('stats-update',refresh);
                SSEModule.connection.addEventListener('tournament-change',refresh);
                SSEModule.connection.addEventListener('general-update',refresh);
                clearInterval(timer);
            } else if (tries > 25) clearInterval(timer);
        },400);
    }
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-dashboard-category]').forEach((button) => button.addEventListener('click', () => { state.category=button.dataset.dashboardCategory; state.page=1; state.sort=null; render(); }));
        document.getElementById('statsDashboardSearch').addEventListener('input',(event) => { state.search=event.target.value; state.page=1; renderTable(); });
        document.getElementById('statsDashboardTournament').addEventListener('change',(event) => { const global=tournamentSelect(); if (global) { global.value=event.target.value; global.dispatchEvent(new Event('change',{bubbles:true})); } refresh(); });
        document.getElementById('statsDashboardMore').addEventListener('click',showAdvanced);
        document.getElementById('statsDashboardLeaders').addEventListener('click',(event) => { if (event.target.closest('[data-stats-open-advanced]')) showAdvanced(); });
        document.getElementById('statsDashboardTable').addEventListener('click',(event) => {
            const sort = event.target.closest('[data-stats-sort]');
            if (sort) { const key=sort.dataset.statsSort; state.direction=state.sort===key ? -state.direction : -1; state.sort=key; state.page=1; renderTable(); return; }
            const page = event.target.closest('[data-stats-page]'); if (page && !page.disabled) { state.page=num(page.dataset.statsPage); renderTable(); return; }
            if (event.target.closest('#statsDashboardExport')) exportCsv();
        });
        const global=tournamentSelect();
        if (global) { global.addEventListener('change', () => { syncTournament(); refresh(); }); new MutationObserver(() => { syncTournament(); refresh(); }).observe(global,{childList:true}); }
        syncTournament(); setTimeout(refresh,700); connectSse();
    });
})();

(function () {
    'use strict';

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const set = (id, html) => { const node = document.getElementById(id); if (node) node.innerHTML = html; };
    const number = (value) => Number(value) || 0;
    const avg = (value) => number(value).toFixed(3).replace(/^0/, '');
    const logo = (id) => `<img src="/api/equipos/${encodeURIComponent(id)}/logo" alt="" loading="lazy" onerror="this.style.display='none'">`;
    const playerLink = (player) => `jugador.html?id=${encodeURIComponent(player.id)}&equipo=${encodeURIComponent(currentTeamId)}`;

    function activate(name) {
        document.querySelectorAll('[data-team-panel]').forEach((button) => {
            const active = button.dataset.teamPanel === name;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        const ids = { resumen: 'teamPanelResumen', roster: 'teamPanelRoster', calendario: 'teamPanelCalendario', estadisticas: 'teamPanelEstadisticas', analisis: 'teamPanelAnalisis' };
        Object.entries(ids).forEach(([key, id]) => {
            const panel = document.getElementById(id);
            if (!panel) return;
            panel.hidden = key !== name;
            panel.classList.toggle('active', key === name);
        });
        history.replaceState(null, '', `${location.pathname}${location.search}#${name}`);
    }

    function render() {
        if (!teamData) return;
        const standing = standingsData.find((row) => Number(row.id || row.equipo_id) === Number(currentTeamId));
        const wins = number(standing?.pg), losses = number(standing?.pp);
        const record = standing ? `${wins} - ${losses}` : (document.getElementById('teamRecord')?.textContent || '--').replace(/\s*\(.*\)/, '');
        const streak = typeof calcularRacha === 'function' ? calcularRacha(recentGames) : '';
        const streakText = streak ? streak.replace(/^W/, 'G').replace(/^L/, 'P') : '--';
        document.getElementById('teamDashboardRecord').textContent = record;
        document.getElementById('teamDashboardPosition').textContent = standing?.ranking ? `${standing.ranking}°` : '--';
        document.getElementById('teamDashboardStreak').textContent = streakText;
        const year = teamData.fecha_creacion ? new Date(teamData.fecha_creacion).getFullYear() : null;
        document.getElementById('teamHeroSubtitle').textContent = [year && !Number.isNaN(year) ? `Registrado ${year}` : null, teamData.ciudad, document.getElementById('tournamentSelect')?.selectedOptions?.[0]?.textContent].filter(Boolean).join('  ·  ');

        const manager = String(teamData.manager || '').trim();
        set('teamDashboardStaff', `<h2>Cuerpo técnico</h2>${manager ? `<div class="team-staff-person"><span class="team-person-avatar">${esc(manager.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase())}</span><div><strong>${esc(manager)}</strong><small>Manager</small></div></div>` : '<p class="team-muted">No hay cuerpo técnico registrado.</p>'}`);
        const description = teamData.descripcion || teamData.descripcion_equipo || '';
        set('teamDashboardIntro', `<h2>Resumen del equipo</h2>${description ? `<p>${esc(description)}</p>` : `<p>Consulta el rendimiento oficial de ${esc(teamData.nombre)} en el torneo seleccionado.</p>`}<div class="team-overview-metrics"><div><span>Partidos</span><strong>${standing ? number(standing.pj) : '--'}</strong></div><div><span>Victorias</span><strong>${standing ? wins : '--'}</strong></div><div><span>Derrotas</span><strong>${standing ? losses : '--'}</strong></div></div>`);

        const finished = [...recentGames].filter((game) => game.estado === 'finalizado' && game.carreras_local != null && game.carreras_visitante != null).sort((a, b) => String(b.fecha_partido || '').localeCompare(String(a.fecha_partido || '')) || Number(b.id) - Number(a.id));
        const resultRows = finished.slice(0, 5).map((game) => {
            const home = Number(game.equipo_local_id) === Number(currentTeamId);
            const scored = number(home ? game.carreras_local : game.carreras_visitante);
            const allowed = number(home ? game.carreras_visitante : game.carreras_local);
            const rivalId = home ? game.equipo_visitante_id : game.equipo_local_id;
            const rival = home ? game.equipo_visitante_nombre : game.equipo_local_nombre;
            const result = scored > allowed ? 'G' : scored < allowed ? 'P' : 'E';
            const date = game.fecha_partido ? new Date(String(game.fecha_partido).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—';
            return `<a class="team-result-row" href="partido.html?id=${encodeURIComponent(game.id)}"><time>${esc(date)}</time><span class="team-result-rival">${logo(rivalId, rival)}<span>vs ${esc(rival || 'Rival')}</span></span><b class="${result === 'G' ? 'win' : result === 'P' ? 'loss' : ''}">${result}</b><strong>${scored} - ${allowed}</strong></a>`;
        }).join('');
        set('teamDashboardResults', `<div class="team-card-head"><h2>Últimos resultados</h2><button type="button" data-open-panel="calendario">Ver calendario →</button></div>${resultRows || '<p class="team-muted">Aún no hay resultados para este torneo.</p>'}`);

        const batById = new Map(teamBattingRows.map((row) => [Number(row.id), row]));
        const rosterRows = rosterData.slice(0, 5).map((player) => {
            const stats = batById.get(Number(player.id));
            return `<tr><td>${player.numero ?? '—'}</td><td><a href="${playerLink(player)}"><span class="team-player-avatar">${esc((player.nombre || 'J').slice(0, 1))}</span>${esc(player.nombre)}</a></td><td>${esc(player.posicion || '—')}</td><td>${stats ? avg(stats.avg) : '—'}</td><td>${stats ? stats.hr : '—'}</td><td>${stats ? stats.rbi : '—'}</td></tr>`;
        }).join('');
        set('teamDashboardRoster', `<div class="team-card-head"><h2>Roster del equipo (${rosterData.length})</h2><button type="button" data-open-panel="roster">Ver roster completo →</button></div><div class="team-table-scroll"><table class="team-dashboard-table"><thead><tr><th>#</th><th>Jugador</th><th>Pos.</th><th>AVG</th><th>HR</th><th>RBI</th></tr></thead><tbody>${rosterRows || '<tr><td colspan="6">Sin jugadores registrados.</td></tr>'}</tbody></table></div>`);

        const batting = teamBattingRows.filter((row) => row.ab > 0);
        const categories = [
            ['Promedio de bateo (AVG)', [...batting].sort((a, b) => b.avg - a.avg)[0], (row) => avg(row.avg)],
            ['Cuadrangulares (HR)', [...batting].sort((a, b) => b.hr - a.hr)[0], (row) => row.hr],
            ['Impulsadas (RBI)', [...batting].sort((a, b) => b.rbi - a.rbi)[0], (row) => row.rbi],
            ['Efectividad (ERA)', teamPitchingRows[0], (row) => number(row.era).toFixed(2)]
        ];
        set('teamDashboardLeaders', `<h2>Líderes del equipo</h2><div class="team-leaders-grid">${categories.map(([label, row, value]) => `<div class="team-leader"><small>${label}</small>${row ? `<a href="${playerLink(row)}"><span class="team-person-avatar">${esc((row.nombre || 'J').slice(0, 1))}</span><span><strong>${esc(row.nombre)}</strong><b>${esc(value(row))}</b></span></a>` : '<span class="team-muted">Sin datos</span>'}</div>`).join('')}</div>`);

        const runs = standing ? number(standing.cf) : number(document.getElementById('runsScored')?.textContent);
        const allowed = standing ? number(standing.ce) : number(document.getElementById('runsAllowed')?.textContent);
        const stats = [['Carreras anotadas', runs], ['Carreras permitidas', allowed], ['Promedio de bateo', document.getElementById('teamAvg')?.textContent || '—'], ['Cuadrangulares', document.getElementById('teamHr')?.textContent || '—'], ['OPS', document.getElementById('teamOps')?.textContent || '—']];
        set('teamDashboardStats', `<h2>Estadísticas del equipo</h2><div class="team-stat-list">${stats.map(([label, value]) => `<div><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`);

        set('teamPanelRoster', `<section class="team-dashboard-card"><h2>Roster completo · ${esc(teamData.nombre)}</h2><p class="team-muted">Plantilla registrada en el torneo seleccionado.</p><div class="team-table-scroll"><table class="team-dashboard-table"><thead><tr><th>#</th><th>Jugador</th><th>Posición</th><th>AVG</th><th>HR</th><th>RBI</th></tr></thead><tbody>${rosterData.map((player) => { const stat = batById.get(Number(player.id)); return `<tr><td>${player.numero ?? '—'}</td><td><a href="${playerLink(player)}">${esc(player.nombre)}</a></td><td>${esc(player.posicion || '—')}</td><td>${stat ? avg(stat.avg) : '—'}</td><td>${stat ? stat.hr : '—'}</td><td>${stat ? stat.rbi : '—'}</td></tr>`; }).join('') || '<tr><td colspan="6">Sin jugadores registrados.</td></tr>'}</tbody></table></div></section>`);
        set('teamPanelCalendario', `<section class="team-dashboard-card"><h2>Calendario y resultados</h2><p class="team-muted">${recentGames.length} partido${recentGames.length === 1 ? '' : 's'} en el torneo seleccionado.</p>${[...recentGames].sort((a,b) => String(b.fecha_partido || '').localeCompare(String(a.fecha_partido || ''))).map((game) => { const home = Number(game.equipo_local_id) === Number(currentTeamId); const rival = home ? game.equipo_visitante_nombre : game.equipo_local_nombre; const date = game.fecha_partido ? new Date(String(game.fecha_partido).slice(0,10) + 'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}) : 'Fecha por definir'; const done = game.estado === 'finalizado'; const scored = number(home ? game.carreras_local : game.carreras_visitante); const allowed = number(home ? game.carreras_visitante : game.carreras_local); return `<a class="team-calendar-row" href="partido.html?id=${encodeURIComponent(game.id)}"><time>${esc(date)}</time><strong>${esc(teamData.nombre)} vs ${esc(rival || 'Rival')}</strong><span>${done ? `${scored} - ${allowed}` : 'Próximo'}</span><small>Ver detalle →</small></a>`; }).join('') || '<p class="team-muted">Sin partidos registrados.</p>'}</section>`);
        set('teamPanelEstadisticas', `<section class="team-dashboard-card"><h2>Rendimiento del equipo</h2><div class="team-stat-list">${stats.map(([label,value]) => `<div><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div><button type="button" class="team-analysis-link" data-open-panel="analisis">Ver estadísticas completas y scouting →</button></section>`);
    }

    document.addEventListener('DOMContentLoaded', () => {
        const placeTournament = () => {
            const control = document.querySelector('.team-header-tournament');
            const host = window.matchMedia('(max-width: 760px)').matches ? document.getElementById('teamMobileTournamentHost') : document.querySelector('.brand-nav');
            if (control && host && control.parentElement !== host) {
                if (host.classList.contains('brand-nav')) host.insertBefore(control, host.querySelector('.brand-admin-link'));
                else host.appendChild(control);
            }
        };
        placeTournament();
        window.addEventListener('resize', placeTournament);
        document.querySelectorAll('[data-team-panel]').forEach((button) => button.addEventListener('click', () => activate(button.dataset.teamPanel)));
        document.addEventListener('click', (event) => {
            const action = event.target.closest('[data-open-panel]');
            if (action) { activate(action.dataset.openPanel); document.querySelector('.team-profile-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
        document.addEventListener('chogui:team-data', render);
        const requested = location.hash.slice(1);
        if (['resumen','roster','calendario','estadisticas','analisis'].includes(requested)) activate(requested);
    });
})();

(function () {
    'use strict';
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const value = (n) => n == null ? '—' : String(n);
    const rate = (n) => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(3).replace(/^0/, '');
    const shortDate = (raw) => raw ? new Date(String(raw).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', {day:'2-digit', month:'short', year:'numeric'}) : '—';
    let sequence = 0;

    function activate(name) {
        document.querySelectorAll('[data-profile-tab]').forEach((button) => {
            const active = button.dataset.profileTab === name;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        const panels = {resumen:'profilePanelResumen', partidos:'profilePanelPartidos', splits:'profilePanelSplits', biografia:'profilePanelBiografia', comparar:'profilePanelComparar', completas:'profilePanelCompletas'};
        Object.entries(panels).forEach(([key, id]) => { document.getElementById(id).hidden = key !== name; });
        history.replaceState(null, '', `${location.pathname}${location.search}#${name}`);
        if (typeof radarChart !== 'undefined' && radarChart && name === 'resumen') radarChart.resize();
    }

    function moveExistingViews() {
        const radar = document.getElementById('radarChart');
        document.getElementById('playerRadarHost').appendChild(radar);
        const splits = document.getElementById('playerScoutingSummary')?.closest('.detailed-table-section');
        if (splits) document.getElementById('playerSplitsHost').appendChild(splits);
        const compare = document.getElementById('similarPlayersChips')?.closest('.detailed-table-section');
        if (compare) document.getElementById('playerCompareHost').appendChild(compare);
    }

    function gameTable(games, limit) {
        const rows = (limit ? games.slice(0, limit) : games).map((game) => {
            const registeredTeamId = game.jugador_equipo_id || game.equipo_id || playerData?.equipo_id;
            const home = Number(game.equipo_local_id) === Number(registeredTeamId);
            const visitor = Number(game.equipo_visitante_id) === Number(registeredTeamId);
            const rival = home ? game.equipo_visitante_nombre : visitor ? game.equipo_local_nombre : `${game.equipo_local_nombre || 'Local'} vs ${game.equipo_visitante_nombre || 'Visitante'}`;
            const rivalId = home ? game.equipo_visitante_id : visitor ? game.equipo_local_id : null;
            const scored = home ? game.carreras_local : visitor ? game.carreras_visitante : null;
            const allowed = home ? game.carreras_visitante : visitor ? game.carreras_local : null;
            const result = scored == null || allowed == null ? '—' : Number(scored) > Number(allowed) ? 'G' : Number(scored) < Number(allowed) ? 'P' : 'E';
            const resultClass = result === 'G' ? 'win' : result === 'P' ? 'loss' : '';
            const id = game.partido_id || game.id;
            return `<tr><td>${esc(shortDate(game.fecha_partido))}</td><td><a class="player-rival-link" href="${rivalId ? `equipo.html?id=${encodeURIComponent(rivalId)}` : '#'}">${rivalId ? `<img src="/api/equipos/${encodeURIComponent(rivalId)}/logo" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}${esc(rival || 'Rival')}</a></td><td><span class="player-result ${resultClass}">${esc(result)}</span> ${scored != null && allowed != null ? `${esc(scored)} - ${esc(allowed)}` : ''}</td><td>${esc(value(game.at_bats))}</td><td>${esc(value(game.hits))}</td><td>${esc(value(game.home_runs))}</td><td>${esc(value(game.rbi))}</td><td>${esc(value(game.runs))}</td><td><a class="player-detail-link" href="partido.html?id=${encodeURIComponent(id)}">Ver partido →</a></td></tr>`;
        }).join('');
        if (!rows) return '<p class="player-muted">Todavía no hay partidos vinculados a este jugador.</p>';
        return `<div class="player-table-scroll"><table class="player-dashboard-table"><thead><tr><th>FECHA</th><th>RIVAL</th><th>RESULTADO</th><th>VB</th><th>H</th><th>HR</th><th>RBI</th><th>C</th><th>DETALLE</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function statTable(title, fields, row) {
        if (!row) return '';
        return `<div class="player-table-scroll"><table class="player-dashboard-table"><thead><tr><th>COMPETENCIA</th>${fields.map(([key, label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody><tr><td>${esc(title)}</td>${fields.map(([key, label, format]) => `<td>${esc(format ? format(row[key]) : value(row[key]))}</td>`).join('')}</tr></tbody></table></div>`;
    }

    async function render() {
        if (!playerData) return;
        const run = ++sequence;
        const selected = document.getElementById('tournamentSelect');
        const tournament = selected?.value || currentTournamentId || 'todos';
        const query = `&torneo_id=${encodeURIComponent(tournament)}`;
        const gameQuery = tournament === 'todos' ? '' : `?torneo_id=${encodeURIComponent(tournament)}`;
        const [offData, pitchData, logData, fallback, historyData] = await Promise.all([
            fetchSafe(`/api/estadisticas-ofensivas?jugador_id=${encodeURIComponent(jugadorId)}${query}`),
            fetchSafe(`/api/estadisticas-pitcheo?jugador_id=${encodeURIComponent(jugadorId)}${query}`),
            fetchSafe(`/api/jugadores/${encodeURIComponent(jugadorId)}/game-log${gameQuery}`),
            fetchSafe(`/api/jugadores/${encodeURIComponent(jugadorId)}/partidos${gameQuery}`),
            fetchSafe(`/api/jugadores/${encodeURIComponent(jugadorId)}/historico`)
        ]);
        if (run !== sequence) return;
        const offense = Array.isArray(offData) ? offData.find((row) => String(row.jugador_id) === String(jugadorId)) || offData[0] : offData;
        const pitching = Array.isArray(pitchData) ? pitchData.find((row) => String(row.jugador_id) === String(jugadorId)) || pitchData[0] : pitchData;
        const games = Array.isArray(logData?.games) && logData.games.length ? logData.games : Array.isArray(fallback) ? fallback : [];
        const primaryPitcher = String(playerData.posicion || '').toUpperCase() === 'P' && !offense;
        const displayName = playerData.nombre || 'Jugador';
        const number = playerData.numero != null && String(playerData.numero).trim() !== '' ? `#${playerData.numero}` : '';
        text('playerDashboardName', displayName);
        text('playerDashboardNumber', number);
        const avatar = document.getElementById('playerDashboardAvatar');
        avatar.src = getPlayerAvatarByPosition(playerData.posicion);
        avatar.alt = `Avatar ilustrado de ${displayName}`;
        const team = playerData.equipo_nombre || 'Sin equipo';
        const teamLink = document.getElementById('playerDashboardTeam');
        teamLink.href = playerData.equipo_id ? `equipo.html?id=${encodeURIComponent(playerData.equipo_id)}` : 'index.html#equipos';
        teamLink.innerHTML = `${playerData.equipo_id ? `<img src="/api/equipos/${encodeURIComponent(playerData.equipo_id)}/logo" alt="" onerror="this.style.display='none'">` : ''}<strong>${esc(team)}</strong>`;
        const details = [['Posición', formatPos(playerData.posicion)], ['Batea', playerData.batea || playerData.bateo], ['Lanza', playerData.lanza || playerData.lanzamiento], ['Número', number]] .filter(([, item]) => item);
        set('playerDashboardDetails', details.map(([label, item]) => `<div><span>${esc(label)}</span><strong>${esc(item)}</strong></div>`).join(''));
        set('playerDashboardBadges', [number ? `<span>${esc(number)}</span>` : '', tournament && tournament !== 'todos' ? `<span>${esc(selected?.selectedOptions?.[0]?.textContent || 'Torneo')}</span>` : ''].join(''));
        if (primaryPitcher) {
            const ip = Number(pitching?.innings_pitched || 0);
            document.querySelectorAll('.player-dashboard-kpis span').forEach((node, i) => node.textContent = ['Efectividad · ERA','Bases por entrada · WHIP','Ponches · SO','Entradas · IP'][i]);
            text('playerKpiAvg', ip ? (Number(pitching.earned_runs || 0) * 9 / ip).toFixed(2) : '—');
            text('playerKpiHr', ip ? ((Number(pitching.hits_allowed || 0) + Number(pitching.walks_allowed || 0)) / ip).toFixed(2) : '—');
            text('playerKpiRbi', value(pitching?.strikeouts)); text('playerKpiOps', value(pitching?.innings_pitched));
        } else {
            document.querySelectorAll('.player-dashboard-kpis span').forEach((node, i) => node.textContent = ['Promedio de bateo · AVG','Cuadrangulares · HR','Impulsadas · RBI','Producción · OPS'][i]);
            const ab = Number(offense?.at_bats || 0), hits = Number(offense?.hits || 0);
            const avg = ab ? hits / ab : offense?.avg;
            const obp = offense?.obp != null ? Number(offense.obp) : (ab + Number(offense?.walks || 0) + Number(offense?.hit_by_pitch || 0) + Number(offense?.sacrifice_flies || 0)) ? (hits + Number(offense?.walks || 0) + Number(offense?.hit_by_pitch || 0)) / (ab + Number(offense?.walks || 0) + Number(offense?.hit_by_pitch || 0) + Number(offense?.sacrifice_flies || 0)) : null;
            const slg = offense?.slg != null ? Number(offense.slg) : ab ? (hits + Number(offense?.doubles || 0) + Number(offense?.triples || 0) * 2 + Number(offense?.home_runs || 0) * 3) / ab : null;
            text('playerKpiAvg', offense ? rate(avg) : '—'); text('playerKpiHr', value(offense?.home_runs)); text('playerKpiRbi', value(offense?.rbi)); text('playerKpiOps', offense ? rate(offense.ops ?? (obp != null && slg != null ? obp + slg : null)) : '—');
        }
        const offenseFields = [['at_bats','VB'],['runs','C'],['hits','H'],['doubles','2B'],['triples','3B'],['home_runs','HR'],['rbi','RBI'],['walks','BB'],['strikeouts','K'],['avg','AVG',rate],['obp','OBP',rate],['slg','SLG',rate],['ops','OPS',rate],['stolen_bases','BR']];
        const pitchFields = [['innings_pitched','IP'],['hits_allowed','H'],['earned_runs','CL'],['walks_allowed','BB'],['strikeouts','K'],['home_runs_allowed','HR'],['wins','G'],['losses','P'],['saves','SV'],['era','ERA'],['whip','WHIP']];
        const tournamentName = selected?.selectedOptions?.[0]?.textContent || 'Torneo seleccionado';
        set('playerSeasonSummary', `<div class="player-card-head"><h2>Estadísticas de ${esc(tournamentName)}</h2><button type="button" data-open-profile="completas">Ver todas →</button></div>${offense ? `<h3>Bateo</h3>${statTable(tournamentName, offenseFields, {...offense, avg:offense.avg ?? (Number(offense.at_bats) ? Number(offense.hits)/Number(offense.at_bats) : null)})}` : ''}${pitching ? `<h3>Pitcheo</h3>${statTable(tournamentName, pitchFields, pitching)}` : ''}${!offense && !pitching ? '<p class="player-muted">Aún no hay estadísticas registradas en este torneo.</p>' : ''}`);
        set('playerRecentSummary', `<div class="player-card-head"><h2>Últimos partidos</h2><button type="button" data-open-profile="partidos">Ver todos →</button></div>${gameTable(games, 5)}`);
        set('playerAllGames', `<h2>Partidos del jugador</h2>${gameTable(games)}`);
        const profileRows = [['Equipo', team, playerData.equipo_id ? `equipo.html?id=${encodeURIComponent(playerData.equipo_id)}` : null], ['Posición', formatPos(playerData.posicion)], ['Número', number], ['Batea', playerData.batea || playerData.bateo], ['Lanza', playerData.lanza || playerData.lanzamiento]].filter(([, item]) => item);
        const profileHtml = `<h2>Perfil del jugador</h2><div class="player-profile-list">${profileRows.map(([label,item,href]) => `<div><span>${esc(label)}</span>${href ? `<a href="${href}">${esc(item)}</a>` : `<strong>${esc(item)}</strong>`}</div>`).join('')}</div>`;
        set('playerProfileSummary', profileHtml);
        const biography = playerData.biografia || playerData.descripcion || '';
        set('playerBiography', `${profileHtml}<h2>Biografía</h2><p class="player-muted">${biography ? esc(biography) : 'No hay biografía registrada para este jugador.'}</p>`);
        const awards = historyData?.career?.awards;
        const awardCard = document.getElementById('playerAwardsSummary');
        awardCard.hidden = !Number(awards?.total);
        if (!awardCard.hidden) set('playerAwardsSummary', `<h2>Logros registrados</h2><div class="player-profile-list">${(awards.detalle || []).map((award) => `<div><span>${esc(award.lado === 'ofensiva' ? 'Ofensiva' : 'Defensiva')} · ${esc(award.posicion || '')}</span><strong>${esc(award.titulos)} ${Number(award.titulos) === 1 ? 'título' : 'títulos'}${award.ultimo_torneo ? ` · ${esc(award.ultimo_torneo)}` : ''}</strong></div>`).join('')}</div>`);
    }

    document.addEventListener('DOMContentLoaded', () => {
        moveExistingViews();
        const placeTournament = () => {
            const control = document.querySelector('.player-header-tournament');
            const host = matchMedia('(max-width: 760px)').matches ? document.getElementById('playerMobileTournamentHost') : document.querySelector('.brand-nav');
            if (control && host && control.parentElement !== host) {
                if (host.classList.contains('brand-nav')) host.insertBefore(control, host.querySelector('.brand-admin-link'));
                else host.appendChild(control);
            }
        };
        placeTournament(); window.addEventListener('resize', placeTournament);
        document.querySelectorAll('[data-profile-tab]').forEach((button) => button.addEventListener('click', () => activate(button.dataset.profileTab)));
        document.addEventListener('click', (event) => { const button = event.target.closest('[data-open-profile]'); if (button) { activate(button.dataset.openProfile); document.querySelector('.player-dashboard-tabs')?.scrollIntoView({behavior:'smooth', block:'start'}); } });
        document.addEventListener('chogui:player-data', render);
        const hash = location.hash.slice(1); if (['resumen','partidos','splits','biografia','comparar','completas'].includes(hash)) activate(hash);
    });
})();

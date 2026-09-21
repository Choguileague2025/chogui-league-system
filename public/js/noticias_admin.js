(function () {
    'use strict';
    const byId = (id) => document.getElementById(id);
    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    let articles = [];
    const message = (value, error = false) => {
        byId('newsAdminMessage').textContent = value;
        byId('newsAdminMessage').style.color = error ? '#ef5350' : '#3ccf78';
    };
    const reset = () => {
        byId('newsAdminForm').reset();
        byId('newsAdminId').value = '';
        message('');
    };

    async function load() {
        const [newsResponse, tournamentsResponse] = await Promise.all([fetch('/api/noticias/admin'), fetch('/api/torneos')]);
        if (!newsResponse.ok || !tournamentsResponse.ok) throw new Error('No se pudieron cargar las publicaciones');
        articles = await newsResponse.json();
        const tournamentPayload = await tournamentsResponse.json();
        const tournaments = Array.isArray(tournamentPayload) ? tournamentPayload : tournamentPayload.data || [];
        byId('newsAdminTournament').innerHTML = '<option value="">Toda la liga</option>' + tournaments.map((item) => `<option value="${Number(item.id)}">${escape(item.nombre)}</option>`).join('');
        byId('newsAdminList').innerHTML = articles.length ? articles.map((item) => {
            const tournament = tournaments.find((entry) => String(entry.id) === String(item.torneo_id));
            return `<article class="news-admin-row"><div><strong>${escape(item.titulo)}</strong><p>${escape(item.resumen)}</p><small>${escape(item.categoria)} · ${escape(tournament?.nombre || 'Toda la liga')} · ${item.publicado ? 'Publicado' : 'Borrador'}</small></div><div><button type="button" data-news-edit="${item.id}">Editar</button><button type="button" data-news-delete="${item.id}">Eliminar</button></div></article>`;
        }).join('') : '<p>Aún no hay publicaciones. Crea el primer borrador arriba.</p>';
    }

    document.addEventListener('DOMContentLoaded', () => {
        const tab = document.querySelector('.nav-tab[data-tab="noticias"]');
        tab?.addEventListener('click', () => load().catch((error) => message(error.message, true)));
        byId('newsAdminReset')?.addEventListener('click', reset);
        byId('newsAdminForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const id = byId('newsAdminId').value;
            const payload = {
                titulo: byId('newsAdminTitle').value,
                resumen: byId('newsAdminSummary').value,
                categoria: byId('newsAdminCategory').value,
                torneo_id: byId('newsAdminTournament').value || null,
                publicado: byId('newsAdminPublished').checked
            };
            try {
                const response = await fetch(id ? `/api/noticias/${id}` : '/api/noticias', {
                    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'No se pudo guardar');
                reset();
                await load();
                message('Publicación guardada.');
            } catch (error) { message(error.message, true); }
        });
        byId('newsAdminList')?.addEventListener('click', async (event) => {
            const edit = event.target.closest('[data-news-edit]');
            const remove = event.target.closest('[data-news-delete]');
            if (edit) {
                const article = articles.find((item) => String(item.id) === edit.dataset.newsEdit);
                if (!article) return;
                byId('newsAdminId').value = article.id;
                byId('newsAdminTitle').value = article.titulo;
                byId('newsAdminSummary').value = article.resumen;
                byId('newsAdminCategory').value = article.categoria;
                byId('newsAdminTournament').value = article.torneo_id || '';
                byId('newsAdminPublished').checked = article.publicado;
                byId('newsAdminForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (remove && window.confirm('¿Eliminar esta publicación?')) {
                try {
                    const response = await fetch(`/api/noticias/${remove.dataset.newsDelete}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('No se pudo eliminar');
                    reset();
                    await load();
                    message('Publicación eliminada.');
                } catch (error) { message(error.message, true); }
            }
        });
    });
})();

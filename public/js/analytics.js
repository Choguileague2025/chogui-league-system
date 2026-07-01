(function initAnalytics() {
    const pathname = window.location.pathname || '/';
    const pageKey = `${pathname}${window.location.search || ''}`;
    const sentKey = `analytics_sent:${pageKey}`;

    if (sessionStorage.getItem(sentKey)) return;

    const visitorStorageKey = 'chogui_visitor_id';
    const sessionStorageKey = 'chogui_session_id';

    function ensureId(storage, key, prefix) {
        let value = storage.getItem(key);
        if (!value) {
            value = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            storage.setItem(key, value);
        }
        return value;
    }

    function inferPageType() {
        if (pathname.includes('jugador')) return 'jugador';
        if (pathname.includes('equipo')) return 'equipo';
        if (pathname.includes('partido')) return 'partido';
        if (pathname.includes('login')) return 'login';
        if (pathname.includes('admin')) return 'admin';
        return 'home';
    }

    function inferPageLabel(type) {
        if (type === 'jugador') return 'Perfil de jugador';
        if (type === 'equipo') return 'Perfil de equipo';
        if (type === 'partido') return 'Boxscore del partido';
        if (type === 'admin') return 'Panel admin';
        return 'Portada de la liga';
    }

    function findTorneoId() {
        const urlParam = new URLSearchParams(window.location.search).get('torneo_id');
        if (urlParam) return Number(urlParam) || null;
        const select = document.getElementById('tournamentSelect') || document.getElementById('tournamentSelector');
        if (select && select.value) return Number(select.value) || null;
        return null;
    }

    function sendVisit() {
        const type = inferPageType();
        const payload = {
            visitor_id: ensureId(localStorage, visitorStorageKey, 'v'),
            session_id: ensureId(sessionStorage, sessionStorageKey, 's'),
            page_path: pathname,
            page_type: type,
            page_label: inferPageLabel(type),
            entity_id: Number(new URLSearchParams(window.location.search).get('id')) || null,
            torneo_id: findTorneoId(),
            referrer: document.referrer || ''
        };

        const body = JSON.stringify(payload);
        sessionStorage.setItem(sentKey, '1');

        if (navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon('/api/analytics/visit', blob);
            return;
        }

        fetch('/api/analytics/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true
        }).catch(() => {});
    }

    window.addEventListener('load', () => {
        window.setTimeout(sendVisit, 1200);
    }, { once: true });
})();

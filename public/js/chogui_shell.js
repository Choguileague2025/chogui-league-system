(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        const stripEmoji = (value) => String(value || '')
            .replace(/🥇/gu, '1')
            .replace(/🥈/gu, '2')
            .replace(/🥉/gu, '3')
            .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
            .replace(/^\s+/, '');
        const cleanNode = (root) => {
            if (!root) return;
            if (root.nodeType === Node.TEXT_NODE) {
                const cleaned = stripEmoji(root.textContent);
                if (cleaned !== root.textContent) root.textContent = cleaned;
                return;
            }
            if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
            if (root.matches?.('input[placeholder]')) root.placeholder = stripEmoji(root.placeholder);
            root.querySelectorAll?.('input[placeholder]').forEach((input) => { input.placeholder = stripEmoji(input.placeholder); });
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
                const cleaned = stripEmoji(node.textContent);
                if (cleaned !== node.textContent) node.textContent = cleaned;
                node = walker.nextNode();
            }
        };
        cleanNode(document.body);
        new MutationObserver((mutations) => {
            mutations.forEach((mutation) => mutation.addedNodes.forEach(cleanNode));
        }).observe(document.body, { childList: true, subtree: true });

        const header = document.querySelector('.brand-topbar-inner');
        if (!header || header.querySelector('.mobile-menu-toggle')) return;

        const button = document.createElement('button');
        button.className = 'mobile-menu-toggle';
        button.type = 'button';
        button.setAttribute('aria-label', 'Abrir menú');
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

        const overlay = document.createElement('div');
        overlay.className = 'mobile-menu-overlay';

        const menu = document.createElement('nav');
        menu.className = 'mobile-menu';
        menu.setAttribute('aria-label', 'Navegación móvil');
        menu.innerHTML = `
            <h3>CHOGUI LEAGUE</h3>
            <a class="mobile-menu-item" href="index.html#inicio">Inicio</a>
            <a class="mobile-menu-item" href="index.html#posiciones">Posiciones</a>
            <a class="mobile-menu-item" href="index.html#partidos">Partidos</a>
            <a class="mobile-menu-item" href="index.html#equipos">Equipos</a>
            <a class="mobile-menu-item" href="index.html#jugadores">Jugadores</a>
            <a class="mobile-menu-item" href="index.html#estadisticas">Estadísticas</a>
            <div class="mobile-menu-secondary"><a class="mobile-menu-item" href="login.html">Admin</a></div>`;

        const close = () => {
            menu.classList.remove('active');
            overlay.classList.remove('active');
            button.setAttribute('aria-expanded', 'false');
        };
        button.addEventListener('click', () => {
            const open = !menu.classList.contains('active');
            menu.classList.toggle('active', open);
            overlay.classList.toggle('active', open);
            button.setAttribute('aria-expanded', String(open));
        });
        overlay.addEventListener('click', close);
        menu.addEventListener('click', (event) => {
            if (event.target.closest('a')) close();
        });

        header.appendChild(button);
        document.body.append(overlay, menu);

    });
})();

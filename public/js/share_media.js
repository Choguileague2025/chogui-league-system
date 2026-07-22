(function () {
    const state = {
        provider: null,
        initialized: false
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));
    }

    function slugify(value) {
        return String(value || 'chogui-league')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'chogui-league';
    }

    function setFeedback(message, isError = false) {
        const feedback = document.querySelector('[data-share-feedback]');
        if (!feedback) return;
        feedback.textContent = message || '';
        feedback.style.color = isError ? '#7f1d1d' : 'rgba(21, 16, 12, 0.8)';
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            if (!src) {
                reject(new Error('missing-image'));
                return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`image-load-failed:${src}`));
            img.src = src;
        });
    }

    function drawSoftballPattern(ctx, width, height) {
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = '#8f5f00';
        ctx.lineWidth = 8;

        const balls = [
            { x: width - 120, y: 110, r: 56 },
            { x: width - 250, y: 310, r: 30 },
            { x: width - 420, y: 120, r: 24 }
        ];

        balls.forEach((ball) => {
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ball.x - ball.r * 0.26, ball.y, ball.r * 0.8, -0.95, 0.95);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ball.x + ball.r * 0.26, ball.y, ball.r * 0.8, Math.PI - 0.95, Math.PI + 0.95);
            ctx.stroke();
        });

        ctx.restore();
    }

    function getTheme(type) {
        if (type === 'jugador') {
            return {
                gradient: ['#ff9f0a', '#ffca28', '#fff0a8'],
                overlay: ['rgba(9, 18, 34, 0.24)', 'rgba(255, 255, 255, 0.05)'],
                panel: 'rgba(8, 14, 26, 0.92)',
                panelSoft: 'rgba(12, 18, 31, 0.84)',
                accent: '#3ec7ff',
                accentSoft: 'rgba(62, 199, 255, 0.18)'
            };
        }
        if (type === 'partido') {
            return {
                gradient: ['#0f1726', '#122038', '#1f3b64'],
                overlay: ['rgba(255, 193, 7, 0.16)', 'rgba(255, 255, 255, 0.03)'],
                panel: 'rgba(8, 12, 20, 0.94)',
                panelSoft: 'rgba(13, 19, 30, 0.9)',
                accent: '#ffc107',
                accentSoft: 'rgba(255, 193, 7, 0.16)'
            };
        }
        return {
            gradient: ['#ffad0f', '#ffc72e', '#fff0a8'],
            overlay: ['rgba(8, 12, 20, 0.18)', 'rgba(255, 255, 255, 0.1)'],
            panel: 'rgba(10, 15, 26, 0.88)',
            panelSoft: 'rgba(14, 20, 32, 0.84)',
            accent: '#0f1726',
            accentSoft: 'rgba(15, 23, 38, 0.14)'
        };
    }

    function drawMetricCard(ctx, metric, index, startX, startY, width) {
        const gap = 18;
        const boxWidth = (width - gap * 3) / 4;
        const x = startX + index * (boxWidth + gap);
        const y = startY;
        const h = 116;

        ctx.save();
        ctx.fillStyle = 'rgba(10, 15, 26, 0.9)';
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.22)';
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, boxWidth, h, 24);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#9aa4b7';
        ctx.font = '700 22px Arial';
        ctx.fillText(metric.label || '--', x + 22, y + 34);

        ctx.fillStyle = '#f7f1dc';
        ctx.font = '900 36px Arial';
        const value = String(metric.value ?? '--');
        ctx.fillText(value, x + 22, y + 78);
        ctx.restore();
    }

    function roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    async function drawLogoBlock(ctx, x, y, size, src, initials, theme, radius = 28) {
        ctx.fillStyle = theme.panel;
        roundRect(ctx, x, y, size, size, radius);
        ctx.fill();

        try {
            const logo = await loadImage(src);
            ctx.save();
            ctx.beginPath();
            roundRect(ctx, x, y, size, size, radius);
            ctx.clip();
            ctx.drawImage(logo, x, y, size, size);
            ctx.restore();
        } catch (error) {
            ctx.fillStyle = '#0f1726';
            roundRect(ctx, x, y, size, size, radius);
            ctx.fill();
            ctx.fillStyle = '#ffc107';
            ctx.font = `900 ${Math.max(34, Math.floor(size * 0.36))}px Arial`;
            ctx.fillText((initials || 'CL').slice(0, 2), x + size * 0.23, y + size * 0.62);
        }
    }

    function drawTopPill(ctx, x, y, text, theme) {
        const content = escapePlain(text).slice(0, 26);
        if (!content) return;
        const pillWidth = Math.max(170, Math.min(260, ctx.measureText(content).width + 36));
        ctx.fillStyle = theme.accentSoft;
        roundRect(ctx, x, y, pillWidth, 46, 22);
        ctx.fill();
        ctx.fillStyle = theme.accent === '#ffc107' ? '#f4d37a' : '#2f2411';
        ctx.font = '800 22px Arial';
        ctx.fillText(content, x + 18, y + 30);
    }

    function drawScoreStrip(ctx, data, theme) {
        if (data.type !== 'partido' || !data.scoreline) return;

        const y = 78;
        ctx.fillStyle = theme.panel;
        roundRect(ctx, 714, y, 422, 150, 32);
        ctx.fill();

        ctx.fillStyle = '#b8c2d3';
        ctx.font = '700 18px Arial';
        ctx.fillText('VISITANTE', 760, y + 28);
        ctx.fillText('LOCAL', 1000, y + 28);

        ctx.fillStyle = '#f7f1dc';
        ctx.font = '800 26px Arial';
        fitText(ctx, data.sideAName || 'Visitante', 740, y + 68, 150, 26, 18);
        fitText(ctx, data.sideBName || 'Local', 980, y + 68, 130, 26, 18);

        ctx.fillStyle = theme.accent;
        ctx.font = '900 58px Arial';
        ctx.fillText(data.scoreline, 842, y + 98);

        if (data.sideALogo) {
            ctx.save();
            ctx.globalAlpha = 0.98;
            roundRect(ctx, 738, y + 78, 58, 58, 18);
            ctx.clip();
            loadImage(data.sideALogo).then((logo) => {
                ctx.drawImage(logo, 738, y + 78, 58, 58);
                ctx.restore();
            }).catch(() => ctx.restore());
        }
        if (data.sideBLogo) {
            ctx.save();
            ctx.globalAlpha = 0.98;
            roundRect(ctx, 1048, y + 78, 58, 58, 18);
            ctx.clip();
            loadImage(data.sideBLogo).then((logo) => {
                ctx.drawImage(logo, 1048, y + 78, 58, 58);
                ctx.restore();
            }).catch(() => ctx.restore());
        }
    }

    async function buildCardImage(data) {
        const width = 1200;
        const height = 630;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const theme = getTheme(data.type);

        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, theme.gradient[0]);
        gradient.addColorStop(0.45, theme.gradient[1]);
        gradient.addColorStop(1, theme.gradient[2]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        const overlay = ctx.createLinearGradient(0, 0, width, 0);
        overlay.addColorStop(0, theme.overlay[0]);
        overlay.addColorStop(1, theme.overlay[1]);
        ctx.fillStyle = overlay;
        ctx.fillRect(0, 0, width, height);

        drawSoftballPattern(ctx, width, height);

        ctx.fillStyle = 'rgba(11, 15, 25, 0.18)';
        roundRect(ctx, 48, 48, width - 96, height - 96, 36);
        ctx.fill();

        await drawLogoBlock(ctx, 58, 58, 168, 168, data.logo, data.initials, theme, 34);

        if (data.secondaryLogo) {
            await drawLogoBlock(ctx, 188, 178, 82, 82, data.secondaryLogo, data.secondaryInitials || data.initials, theme, 24);
        }

        drawTopPill(ctx, 270, 78, (data.kicker || 'Chogui League').toUpperCase(), theme);

        if (data.type === 'partido') {
            await drawScoreStripAsync(ctx, data, theme);
        }

        ctx.fillStyle = data.type === 'partido' ? '#f7f1dc' : '#0c0f17';
        ctx.font = '900 76px Arial';
        const titleWidth = data.type === 'partido' ? 620 : 650;
        wrapText(ctx, data.title || 'Chogui League', 268, 210, titleWidth, 88);

        ctx.fillStyle = data.type === 'partido' ? '#d3d8e2' : '#2b2418';
        ctx.font = '700 34px Arial';
        wrapText(ctx, data.subtitle || '', 268, 286, data.type === 'partido' ? 620 : 680, 44);

        const pills = [data.badge, data.meta, data.linkLabel].filter(Boolean).slice(0, 3);
        pills.forEach((pill, index) => {
            const x = 268 + index * 250;
            ctx.fillStyle = data.type === 'partido' ? 'rgba(255, 193, 7, 0.12)' : 'rgba(21, 16, 12, 0.14)';
            roundRect(ctx, x, 356, 220, 46, 22);
            ctx.fill();
            ctx.fillStyle = data.type === 'partido' ? '#f4d37a' : '#2f2411';
            ctx.font = '800 22px Arial';
            ctx.fillText(String(pill).slice(0, 22), x + 18, 386);
        });

        ctx.fillStyle = theme.panelSoft;
        roundRect(ctx, 938, data.type === 'partido' ? 252 : 92, 198, 170, 32);
        ctx.fill();
        ctx.fillStyle = '#b8c2d3';
        ctx.font = '700 22px Arial';
        ctx.fillText(escapePlain(data.badgeLabel || 'Resumen'), 978, data.type === 'partido' ? 294 : 134);
        ctx.fillStyle = theme.accent;
        ctx.font = '900 54px Arial';
        const badgeValue = String(data.badgeValue ?? '--');
        fitText(ctx, badgeValue, 978, data.type === 'partido' ? 356 : 196, 120, 54, 28);
        ctx.fillStyle = '#f7f1dc';
        ctx.font = '700 24px Arial';
        fitText(ctx, escapePlain(data.badgeMeta || ''), 978, data.type === 'partido' ? 392 : 232, 120, 24, 18);

        const metrics = Array.isArray(data.metrics) ? data.metrics.filter((item) => item && item.label) : [];
        const visibleMetrics = metrics.slice(0, 4);
        visibleMetrics.forEach((metric, index) => drawMetricCard(ctx, metric, index, 74, 444, width - 148));

        ctx.fillStyle = 'rgba(10, 15, 26, 0.8)';
        ctx.font = '700 20px Arial';
        ctx.fillText('choguileague.site', 78, 602);

        return canvas;
    }

    async function drawScoreStripAsync(ctx, data, theme) {
        if (data.type !== 'partido' || !data.scoreline) return;

        const y = 78;
        ctx.fillStyle = theme.panel;
        roundRect(ctx, 714, y, 422, 150, 32);
        ctx.fill();

        if (data.sideALogo) {
            await drawLogoBlock(ctx, 732, y + 66, 58, 58, data.sideALogo, data.sideAInitials || 'V', theme, 18);
        }
        if (data.sideBLogo) {
            await drawLogoBlock(ctx, 1048, y + 66, 58, 58, data.sideBLogo, data.sideBInitials || 'L', theme, 18);
        }

        ctx.fillStyle = '#b8c2d3';
        ctx.font = '700 18px Arial';
        ctx.fillText('VISITANTE', 748, y + 28);
        ctx.fillText('LOCAL', 990, y + 28);

        ctx.fillStyle = '#f7f1dc';
        ctx.font = '800 26px Arial';
        fitText(ctx, data.sideAName || 'Visitante', 802, y + 98, 170, 26, 18);
        fitText(ctx, data.sideBName || 'Local', 828, y + 132, 170, 26, 18);

        ctx.fillStyle = theme.accent;
        ctx.font = '900 58px Arial';
        fitText(ctx, data.scoreline, 862, y + 86, 120, 58, 34);
    }

    function escapePlain(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function fitText(ctx, text, x, y, maxWidth, size, minSize) {
        let fontSize = size;
        while (fontSize > minSize) {
            ctx.font = `900 ${fontSize}px Arial`;
            if (ctx.measureText(text).width <= maxWidth) break;
            fontSize -= 2;
        }
        ctx.fillText(text, x, y);
    }

    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = String(text || '').split(/\s+/);
        let line = '';
        let currentY = y;

        words.forEach((word, index) => {
            const testLine = line ? `${line} ${word}` : word;
            if (ctx.measureText(testLine).width > maxWidth && line) {
                ctx.fillText(line, x, currentY);
                line = word;
                currentY += lineHeight;
                return;
            }
            line = testLine;
            if (index === words.length - 1) {
                ctx.fillText(line, x, currentY);
            }
        });
    }

    function normalizeMetric(label, value) {
        return {
            label: escapePlain(label),
            value: escapePlain(value)
        };
    }

    function resolveData() {
        if (!state.provider) return null;
        const raw = typeof state.provider.getData === 'function'
            ? state.provider.getData()
            : state.provider;
        if (!raw) return null;
        return {
            type: raw.type || 'perfil',
            title: escapePlain(raw.title || 'Chogui League'),
            subtitle: escapePlain(raw.subtitle || ''),
            kicker: escapePlain(raw.kicker || 'Chogui League'),
            badge: escapePlain(raw.badge || ''),
            meta: escapePlain(raw.meta || ''),
            badgeLabel: escapePlain(raw.badgeLabel || 'Resumen'),
            badgeValue: escapePlain(raw.badgeValue || '--'),
            badgeMeta: escapePlain(raw.badgeMeta || ''),
            logo: raw.logo || '/images/logos/chogui-league.png',
            secondaryLogo: raw.secondaryLogo || '',
            secondaryInitials: escapePlain(raw.secondaryInitials || ''),
            initials: escapePlain(raw.initials || 'CL'),
            fileName: escapePlain(raw.fileName || raw.title || 'chogui-league'),
            linkLabel: escapePlain(raw.linkLabel || 'Liga oficial'),
            shareUrl: raw.shareUrl || window.location.href,
            scoreline: escapePlain(raw.scoreline || ''),
            sideAName: escapePlain(raw.sideAName || ''),
            sideBName: escapePlain(raw.sideBName || ''),
            sideALogo: raw.sideALogo || '',
            sideBLogo: raw.sideBLogo || '',
            sideAInitials: escapePlain(raw.sideAInitials || ''),
            sideBInitials: escapePlain(raw.sideBInitials || ''),
            metrics: (raw.metrics || []).map((metric) => normalizeMetric(metric.label, metric.value))
        };
    }

    async function handleShareLink(button) {
        const data = resolveData();
        if (!data) {
            setFeedback('Todavía no hay datos listos para compartir.', true);
            return;
        }

        const url = data.shareUrl || window.location.href;
        const sharePayload = {
            title: data.title,
            text: data.subtitle || data.kicker,
            url
        };

        try {
            if (navigator.share) {
                await navigator.share(sharePayload);
                setFeedback('Enlace compartido.');
                return;
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
                setFeedback('Enlace copiado al portapapeles.');
                return;
            }

            window.prompt('Copia este enlace:', url);
            setFeedback('Enlace listo para copiar.');
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Error compartiendo enlace:', error);
            setFeedback('No se pudo compartir el enlace.', true);
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function handleDownloadCard(button) {
        const data = resolveData();
        if (!data) {
            setFeedback('Todavía no hay datos listos para descargar.', true);
            return;
        }

        try {
            if (button) {
                button.disabled = true;
                button.dataset.originalText = button.textContent;
            }
            setFeedback('Generando imagen...');
            const canvas = await buildCardImage(data);
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `${slugify(data.fileName)}.png`;
            link.click();
            setFeedback('Imagen descargada.');
        } catch (error) {
            console.error('Error generando imagen para compartir:', error);
            setFeedback('No se pudo generar la imagen.', true);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function bindButtons() {
        if (state.initialized) return;
        state.initialized = true;

        const shareButton = document.querySelector('[data-share-link]');
        const downloadButton = document.querySelector('[data-download-card]');

        if (shareButton) {
            shareButton.addEventListener('click', async () => {
                shareButton.disabled = true;
                await handleShareLink(shareButton);
            });
        }

        if (downloadButton) {
            downloadButton.addEventListener('click', async () => {
                await handleDownloadCard(downloadButton);
            });
        }
    }

    window.ChoguiShare = {
        registerPage(provider) {
            state.provider = provider;
            bindButtons();
        },
        getCurrentData: resolveData
    };
})();

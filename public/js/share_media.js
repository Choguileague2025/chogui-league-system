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

    async function buildCardImage(data) {
        const width = 1200;
        const height = 630;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#ffad0f');
        gradient.addColorStop(0.4, '#ffc72e');
        gradient.addColorStop(1, '#fff0a8');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        const overlay = ctx.createLinearGradient(0, 0, width, 0);
        overlay.addColorStop(0, 'rgba(8, 12, 20, 0.18)');
        overlay.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
        ctx.fillStyle = overlay;
        ctx.fillRect(0, 0, width, height);

        drawSoftballPattern(ctx, width, height);

        ctx.fillStyle = 'rgba(11, 15, 25, 0.18)';
        roundRect(ctx, 48, 48, width - 96, height - 96, 36);
        ctx.fill();

        ctx.fillStyle = 'rgba(10, 15, 26, 0.86)';
        roundRect(ctx, 58, 58, 168, 168, 34);
        ctx.fill();

        try {
            const logo = await loadImage(data.logo);
            ctx.save();
            ctx.beginPath();
            roundRect(ctx, 76, 76, 132, 132, 28);
            ctx.clip();
            ctx.drawImage(logo, 76, 76, 132, 132);
            ctx.restore();
        } catch (error) {
            ctx.fillStyle = '#0f1726';
            roundRect(ctx, 76, 76, 132, 132, 28);
            ctx.fill();
            ctx.fillStyle = '#ffc107';
            ctx.font = '900 52px Arial';
            ctx.fillText((data.initials || 'CL').slice(0, 2), 106, 155);
        }

        ctx.fillStyle = 'rgba(21, 16, 12, 0.14)';
        roundRect(ctx, 270, 78, 250, 52, 26);
        ctx.fill();
        ctx.fillStyle = '#2f2411';
        ctx.font = '800 26px Arial';
        ctx.fillText((data.kicker || 'Chogui League').toUpperCase(), 292, 112);

        ctx.fillStyle = '#0c0f17';
        ctx.font = '900 76px Arial';
        wrapText(ctx, data.title || 'Chogui League', 268, 210, 650, 88);

        ctx.fillStyle = '#2b2418';
        ctx.font = '700 34px Arial';
        wrapText(ctx, data.subtitle || '', 268, 286, 680, 44);

        const pills = [data.badge, data.meta, data.linkLabel].filter(Boolean).slice(0, 3);
        pills.forEach((pill, index) => {
            const x = 268 + index * 250;
            ctx.fillStyle = 'rgba(21, 16, 12, 0.14)';
            roundRect(ctx, x, 356, 220, 46, 22);
            ctx.fill();
            ctx.fillStyle = '#2f2411';
            ctx.font = '800 22px Arial';
            ctx.fillText(String(pill).slice(0, 22), x + 18, 386);
        });

        ctx.fillStyle = 'rgba(10, 15, 26, 0.88)';
        roundRect(ctx, 938, 92, 198, 170, 32);
        ctx.fill();
        ctx.fillStyle = '#b8c2d3';
        ctx.font = '700 22px Arial';
        ctx.fillText(escapePlain(data.badgeLabel || 'Resumen'), 978, 134);
        ctx.fillStyle = '#ffc107';
        ctx.font = '900 54px Arial';
        const badgeValue = String(data.badgeValue ?? '--');
        fitText(ctx, badgeValue, 978, 196, 120, 54, 28);
        ctx.fillStyle = '#f7f1dc';
        ctx.font = '700 24px Arial';
        fitText(ctx, escapePlain(data.badgeMeta || ''), 978, 232, 120, 24, 18);

        const metrics = Array.isArray(data.metrics) ? data.metrics.filter((item) => item && item.label) : [];
        const visibleMetrics = metrics.slice(0, 4);
        visibleMetrics.forEach((metric, index) => drawMetricCard(ctx, metric, index, 74, 444, width - 148));

        ctx.fillStyle = 'rgba(10, 15, 26, 0.8)';
        ctx.font = '700 20px Arial';
        ctx.fillText('choguileague.site', 78, 602);

        return canvas;
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
            initials: escapePlain(raw.initials || 'CL'),
            fileName: escapePlain(raw.fileName || raw.title || 'chogui-league'),
            linkLabel: escapePlain(raw.linkLabel || 'Liga oficial'),
            shareUrl: raw.shareUrl || window.location.href,
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

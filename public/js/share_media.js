(function () {
    const state = {
        provider: null,
        initialized: false
    };
    const DEFAULT_SPONSORS = [
        { src: '/images/sponsors/deportes-bd.png', alt: 'Deportes BD' },
        { src: '/images/sponsors/la-santa-barbershop.png', alt: 'La Santa Barbershop' },
        { src: '/images/sponsors/ag.png', alt: 'AG' },
        { src: '/images/sponsors/ap-import.png', alt: 'AP Import' },
        { src: '/images/sponsors/western-union.png', alt: 'Western Union' },
        { src: '/images/sponsors/iphone-go.png', alt: 'iPhone Go' }
    ];

    function slugify(value) {
        return String(value || 'chogui-league')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'chogui-league';
    }

    function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
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

    function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
        const words = cleanText(text).split(/\s+/).filter(Boolean);
        if (!words.length) return y;

        let line = '';
        let currentY = y;
        let lines = 0;

        for (let i = 0; i < words.length; i += 1) {
            const testLine = line ? `${line} ${words[i]}` : words[i];
            if (ctx.measureText(testLine).width > maxWidth && line) {
                ctx.fillText(line, x, currentY);
                currentY += lineHeight;
                lines += 1;
                line = words[i];
                if (maxLines && lines >= maxLines - 1) break;
            } else {
                line = testLine;
            }
        }

        if (line) ctx.fillText(line, x, currentY);
        return currentY;
    }

    function fitText(ctx, text, x, y, maxWidth, size, minSize, color) {
        const safe = cleanText(text);
        let fontSize = size;
        while (fontSize > minSize) {
            ctx.font = `900 ${fontSize}px Arial`;
            if (ctx.measureText(safe).width <= maxWidth) break;
            fontSize -= 2;
        }
        if (color) ctx.fillStyle = color;
        ctx.fillText(safe, x, y);
    }

    function drawSoftballArt(ctx, width, height, color, alpha = 0.08) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(6, Math.round(width * 0.006));
        const samples = [
            { x: width * 0.9, y: height * 0.14, r: width * 0.05 },
            { x: width * 0.78, y: height * 0.32, r: width * 0.028 },
            { x: width * 0.66, y: height * 0.15, r: width * 0.022 }
        ];

        samples.forEach((ball) => {
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ball.x - ball.r * 0.24, ball.y, ball.r * 0.82, -0.92, 0.92);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ball.x + ball.r * 0.24, ball.y, ball.r * 0.82, Math.PI - 0.92, Math.PI + 0.92);
            ctx.stroke();
        });
        ctx.restore();
    }

    function drawTournamentWatermark(ctx, width, height, text, theme, vertical = false) {
        const content = cleanText(text);
        if (!content) return;
        ctx.save();
        ctx.globalAlpha = vertical ? 0.07 : 0.06;
        ctx.fillStyle = theme.inverseText;
        ctx.font = vertical ? '900 90px Arial' : '900 72px Arial';
        ctx.translate(vertical ? width * 0.9 : width * 0.74, vertical ? height * 0.56 : height * 0.24);
        ctx.rotate(vertical ? Math.PI / 2.9 : -Math.PI / 7.5);
        ctx.fillText(content.slice(0, 28).toUpperCase(), 0, 0);
        ctx.restore();
    }

    function getTheme(type, tone) {
        const palettes = {
            equipo: {
                default: {
                    gradient: ['#ffad0f', '#ffc72e', '#fff0a8'],
                    overlay: ['rgba(8,12,20,0.18)', 'rgba(255,255,255,0.08)'],
                    panel: 'rgba(10, 15, 26, 0.9)',
                    panelSoft: 'rgba(14, 20, 32, 0.84)',
                    accent: '#0f1726',
                    pill: 'rgba(15, 23, 38, 0.14)',
                    textMain: '#0c0f17',
                    textSub: '#2b2418',
                    inverseText: '#f7f1dc'
                },
                playoff: {
                    gradient: ['#0f5132', '#1f8a5b', '#a7f3d0'],
                    overlay: ['rgba(8,12,20,0.16)', 'rgba(255,255,255,0.05)'],
                    panel: 'rgba(5, 18, 14, 0.9)',
                    panelSoft: 'rgba(8, 29, 20, 0.84)',
                    accent: '#d1fae5',
                    pill: 'rgba(209,250,229,0.14)',
                    textMain: '#e7fff5',
                    textSub: '#d6f8e7',
                    inverseText: '#f7fffb'
                },
                chase: {
                    gradient: ['#78350f', '#f59e0b', '#fde68a'],
                    overlay: ['rgba(8,12,20,0.14)', 'rgba(255,255,255,0.06)'],
                    panel: 'rgba(34, 18, 6, 0.9)',
                    panelSoft: 'rgba(49, 27, 10, 0.84)',
                    accent: '#fff7d1',
                    pill: 'rgba(255,247,209,0.18)',
                    textMain: '#1d1309',
                    textSub: '#3b2a14',
                    inverseText: '#fff8e7'
                }
            },
            jugador: {
                default: {
                    gradient: ['#ff9f0a', '#ffca28', '#fff0a8'],
                    overlay: ['rgba(9,18,34,0.24)', 'rgba(255,255,255,0.05)'],
                    panel: 'rgba(8, 14, 26, 0.92)',
                    panelSoft: 'rgba(12, 18, 31, 0.84)',
                    accent: '#3ec7ff',
                    pill: 'rgba(62,199,255,0.16)',
                    textMain: '#0c0f17',
                    textSub: '#2f2411',
                    inverseText: '#f7f1dc'
                },
                hot: {
                    gradient: ['#9a3412', '#f97316', '#fdba74'],
                    overlay: ['rgba(8,12,20,0.18)', 'rgba(255,255,255,0.05)'],
                    panel: 'rgba(31, 14, 8, 0.9)',
                    panelSoft: 'rgba(46, 18, 8, 0.84)',
                    accent: '#fff1d6',
                    pill: 'rgba(255,241,214,0.16)',
                    textMain: '#1d110d',
                    textSub: '#3a241a',
                    inverseText: '#fff7ef'
                },
                pitcher: {
                    gradient: ['#0f172a', '#1d4ed8', '#93c5fd'],
                    overlay: ['rgba(255,193,7,0.12)', 'rgba(255,255,255,0.04)'],
                    panel: 'rgba(8, 12, 20, 0.92)',
                    panelSoft: 'rgba(10, 20, 40, 0.84)',
                    accent: '#facc15',
                    pill: 'rgba(250,204,21,0.16)',
                    textMain: '#eff6ff',
                    textSub: '#dbeafe',
                    inverseText: '#f8fbff'
                }
            },
            partido: {
                default: {
                    gradient: ['#0f1726', '#122038', '#1f3b64'],
                    overlay: ['rgba(255,193,7,0.16)', 'rgba(255,255,255,0.03)'],
                    panel: 'rgba(8, 12, 20, 0.94)',
                    panelSoft: 'rgba(13, 19, 30, 0.9)',
                    accent: '#ffc107',
                    pill: 'rgba(255,193,7,0.14)',
                    textMain: '#f7f1dc',
                    textSub: '#d3d8e2',
                    inverseText: '#f7f1dc'
                },
                final: {
                    gradient: ['#111827', '#1f2937', '#374151'],
                    overlay: ['rgba(34,197,94,0.16)', 'rgba(255,255,255,0.03)'],
                    panel: 'rgba(8, 12, 20, 0.96)',
                    panelSoft: 'rgba(14, 20, 32, 0.9)',
                    accent: '#4ade80',
                    pill: 'rgba(74,222,128,0.14)',
                    textMain: '#f7f1dc',
                    textSub: '#d1fae5',
                    inverseText: '#f7f1dc'
                },
                live: {
                    gradient: ['#3b0764', '#6d28d9', '#c4b5fd'],
                    overlay: ['rgba(255,193,7,0.14)', 'rgba(255,255,255,0.04)'],
                    panel: 'rgba(23, 8, 36, 0.94)',
                    panelSoft: 'rgba(35, 14, 58, 0.9)',
                    accent: '#fde047',
                    pill: 'rgba(253,224,71,0.16)',
                    textMain: '#faf5ff',
                    textSub: '#ede9fe',
                    inverseText: '#fffef6'
                },
                upcoming: {
                    gradient: ['#0f172a', '#1e293b', '#94a3b8'],
                    overlay: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'],
                    panel: 'rgba(8, 12, 20, 0.94)',
                    panelSoft: 'rgba(15, 23, 42, 0.9)',
                    accent: '#f8fafc',
                    pill: 'rgba(248,250,252,0.14)',
                    textMain: '#f8fafc',
                    textSub: '#e2e8f0',
                    inverseText: '#ffffff'
                }
            }
        };

        const typeThemes = palettes[type] || palettes.equipo;
        return typeThemes[tone] || typeThemes.default;
    }

    async function drawLogoBlock(ctx, x, y, size, src, initials, theme, radius) {
        ctx.fillStyle = theme.panel;
        roundRect(ctx, x, y, size, size, radius);
        ctx.fill();

        try {
            const image = await loadImage(src);
            ctx.save();
            ctx.beginPath();
            roundRect(ctx, x, y, size, size, radius);
            ctx.clip();
            ctx.drawImage(image, x, y, size, size);
            ctx.restore();
        } catch (error) {
            ctx.fillStyle = '#0f1726';
            roundRect(ctx, x, y, size, size, radius);
            ctx.fill();
            ctx.fillStyle = '#ffc107';
            ctx.font = `900 ${Math.max(28, Math.floor(size * 0.34))}px Arial`;
            ctx.fillText((initials || 'CL').slice(0, 2), x + size * 0.22, y + size * 0.62);
        }
    }

    function drawPill(ctx, x, y, text, theme, maxWidth, textColor) {
        const content = cleanText(text);
        if (!content) return 0;
        ctx.font = '800 22px Arial';
        const width = Math.max(160, Math.min(maxWidth || 260, ctx.measureText(content).width + 36));
        ctx.fillStyle = theme.pill;
        roundRect(ctx, x, y, width, 46, 22);
        ctx.fill();
        ctx.fillStyle = textColor || theme.textMain;
        ctx.fillText(content.slice(0, 28), x + 18, y + 30);
        return width;
    }

    function drawMetricCards(ctx, metrics, x, y, width, height, theme, columns) {
        const list = (metrics || []).filter((item) => item && item.label).slice(0, columns === 2 ? 6 : 4);
        const gap = 18;
        const rows = columns === 2 ? Math.ceil(list.length / 2) : 1;
        const boxWidth = (width - gap * (columns - 1)) / columns;
        const boxHeight = rows > 1 ? (height - gap * (rows - 1)) / rows : height;

        list.forEach((metric, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            const cardX = x + col * (boxWidth + gap);
            const cardY = y + row * (boxHeight + gap);

            ctx.fillStyle = theme.panelSoft;
            ctx.strokeStyle = 'rgba(255, 193, 7, 0.18)';
            ctx.lineWidth = 2;
            roundRect(ctx, cardX, cardY, boxWidth, boxHeight, 24);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#b8c2d3';
            ctx.font = columns === 2 ? '700 26px Arial' : '700 22px Arial';
            ctx.fillText(cleanText(metric.label), cardX + 22, cardY + 34);

            ctx.fillStyle = theme.inverseText;
            fitText(
                ctx,
                cleanText(metric.value || '--'),
                cardX + 22,
                cardY + (rows > 1 ? 88 : 80),
                boxWidth - 44,
                columns === 2 ? 42 : 36,
                columns === 2 ? 24 : 22
            );
        });
    }

    function drawBrandStamp(ctx, width, height, theme, text) {
        ctx.fillStyle = 'rgba(10, 15, 26, 0.72)';
        roundRect(ctx, 60, height - 84, 270, 36, 18);
        ctx.fill();
        ctx.fillStyle = theme.inverseText;
        ctx.font = '700 18px Arial';
        ctx.fillText(cleanText(text || 'choguileague.site'), 78, height - 60);
    }

    function drawBadgePanel(ctx, x, y, width, height, theme, label, value, meta) {
        ctx.fillStyle = theme.panelSoft;
        roundRect(ctx, x, y, width, height, 32);
        ctx.fill();

        ctx.fillStyle = '#b8c2d3';
        ctx.font = '700 22px Arial';
        ctx.fillText(cleanText(label || 'Resumen'), x + 26, y + 40);

        ctx.fillStyle = theme.accent;
        fitText(ctx, cleanText(value || '--'), x + 26, y + 102, width - 52, 48, 24);

        ctx.fillStyle = theme.inverseText;
        ctx.font = '700 20px Arial';
        wrapText(ctx, cleanText(meta || ''), x + 26, y + 136, width - 52, 24, 2);
    }

    async function drawSponsorsRow(ctx, x, y, width, theme, sponsors, compact = false) {
        const visibleSponsors = (sponsors || DEFAULT_SPONSORS).slice(0, compact ? 4 : 5);
        if (!visibleSponsors.length) return;

        ctx.fillStyle = 'rgba(10, 15, 26, 0.74)';
        roundRect(ctx, x, y, width, compact ? 78 : 86, 24);
        ctx.fill();

        ctx.fillStyle = '#b8c2d3';
        ctx.font = compact ? '700 14px Arial' : '700 16px Arial';
        ctx.fillText('Patrocinado por', x + 20, y + 24);

        const cardY = y + 30;
        const gap = 10;
        const logoBox = compact ? 74 : 82;
        for (let i = 0; i < visibleSponsors.length; i += 1) {
            const cardX = x + 18 + i * (logoBox + gap);
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            roundRect(ctx, cardX, cardY, logoBox, compact ? 34 : 40, 12);
            ctx.fill();
            try {
                const img = await loadImage(visibleSponsors[i].src);
                const drawW = compact ? 56 : 62;
                const drawH = compact ? 22 : 24;
                ctx.drawImage(img, cardX + (logoBox - drawW) / 2, cardY + ((compact ? 34 : 40) - drawH) / 2, drawW, drawH);
            } catch (error) {
                ctx.fillStyle = theme.inverseText;
                ctx.font = compact ? '700 10px Arial' : '700 11px Arial';
                ctx.fillText((visibleSponsors[i].alt || 'Sponsor').slice(0, 8), cardX + 8, cardY + 22);
            }
        }
    }

    async function buildLandscapeCanvas(data) {
        const width = 1200;
        const height = 630;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const theme = getTheme(data.type, data.tone);

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

        drawSoftballArt(ctx, width, height, '#8f5f00');
        drawTournamentWatermark(ctx, width, height, data.tournamentName || data.title, theme);

        ctx.fillStyle = 'rgba(11, 15, 25, 0.18)';
        roundRect(ctx, 48, 48, width - 96, height - 96, 36);
        ctx.fill();

        await drawLogoBlock(ctx, 58, 58, 168, 168, data.logo, data.initials, theme, 34);
        if (data.secondaryLogo) {
            await drawLogoBlock(ctx, 188, 178, 82, 82, data.secondaryLogo, data.secondaryInitials || data.initials, theme, 24);
        }

        drawPill(ctx, 270, 78, (data.kicker || 'Chogui League').toUpperCase(), theme, 280, data.type === 'partido' ? '#f4d37a' : theme.textMain);

        if (data.tournamentName) {
            drawPill(ctx, 270, 136, data.tournamentName, theme, 320, data.type === 'partido' ? '#f4d37a' : theme.textSub);
        }

        if (data.type === 'partido') {
            await drawMatchScoreboard(ctx, 714, 78, 422, 150, data, theme);
        }

        ctx.fillStyle = theme.textMain;
        ctx.font = '900 76px Arial';
        wrapText(ctx, data.title || 'Chogui League', 268, 242, data.type === 'partido' ? 620 : 670, 84, 2);

        ctx.fillStyle = theme.textSub;
        ctx.font = '700 34px Arial';
        const subtitleEndY = wrapText(ctx, data.subtitle || '', 268, 320, data.type === 'partido' ? 620 : 700, 44, 2);

        const pills = [data.badge, data.meta, data.linkLabel].filter(Boolean).slice(0, 3);
        const pillsY = Math.max(data.type === 'partido' ? 392 : 382, subtitleEndY + 72);
        pills.forEach((pill, index) => {
            drawPill(ctx, 268 + index * 248, pillsY, pill, theme, 220, data.type === 'partido' ? '#f4d37a' : theme.textMain);
        });

        drawBadgePanel(ctx, 938, data.type === 'partido' ? 252 : 92, 198, 170, theme, data.badgeLabel, data.badgeValue, data.badgeMeta);
        drawMetricCards(ctx, data.metrics, 74, Math.max(444, pillsY + 72), width - 148, 116, theme, 4);

        if (data.decisions?.length && data.type === 'partido') {
            drawDecisionStrip(ctx, 74, 432, 820, 72, data.decisions, theme);
        }

        await drawSponsorsRow(ctx, 802, 534, 330, theme, data.sponsors, true);
        drawBrandStamp(ctx, width, height, theme, data.brandText || 'choguileague.site');
        return canvas;
    }

    async function buildStoryCanvas(data) {
        const width = 1080;
        const height = 1920;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const theme = getTheme(data.type, data.tone);

        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, theme.gradient[0]);
        gradient.addColorStop(0.42, theme.gradient[1]);
        gradient.addColorStop(1, theme.gradient[2]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        const overlay = ctx.createLinearGradient(0, 0, width, height);
        overlay.addColorStop(0, theme.overlay[0]);
        overlay.addColorStop(1, theme.overlay[1]);
        ctx.fillStyle = overlay;
        ctx.fillRect(0, 0, width, height);

        drawSoftballArt(ctx, width, height, '#8f5f00', 0.1);
        drawTournamentWatermark(ctx, width, height, data.tournamentName || data.title, theme, true);

        ctx.fillStyle = 'rgba(11, 15, 25, 0.18)';
        roundRect(ctx, 42, 42, width - 84, height - 84, 48);
        ctx.fill();

        await drawLogoBlock(ctx, 84, 110, 220, 220, data.logo, data.initials, theme, 44);
        if (data.secondaryLogo) {
            await drawLogoBlock(ctx, 246, 286, 110, 110, data.secondaryLogo, data.secondaryInitials || data.initials, theme, 28);
        }

        drawPill(ctx, 84, 392, data.kicker || 'Chogui League', theme, 340, data.type === 'partido' ? '#f4d37a' : theme.textMain);
        if (data.tournamentName) {
            drawPill(ctx, 84, 452, data.tournamentName, theme, 420, data.type === 'partido' ? '#f4d37a' : theme.textSub);
        }

        ctx.fillStyle = theme.textMain;
        ctx.font = '900 90px Arial';
        const titleY = wrapText(ctx, data.title || 'Chogui League', 84, 620, 760, 94, 3);

        ctx.fillStyle = theme.textSub;
        ctx.font = '700 44px Arial';
        const subtitleEndY = wrapText(ctx, data.subtitle || '', 84, titleY + 86, 820, 56, 3);

        let mainBlockY = subtitleEndY + 90;
        if (data.type === 'partido' && data.scoreline) {
            await drawMatchScoreboard(ctx, 84, mainBlockY, 912, 240, data, theme, true);
            mainBlockY += 290;
        } else {
            drawBadgePanel(ctx, 774, 146, 230, 210, theme, data.badgeLabel, data.badgeValue, data.badgeMeta);
        }

        const pillsY = Math.max(mainBlockY, 1120);
        drawPill(ctx, 84, pillsY, data.badge, theme, 320, data.type === 'partido' ? '#f4d37a' : theme.textMain);
        drawPill(ctx, 418, pillsY, data.meta, theme, 320, data.type === 'partido' ? '#f4d37a' : theme.textMain);
        drawPill(ctx, 752, pillsY, data.linkLabel, theme, 244, data.type === 'partido' ? '#f4d37a' : theme.textMain);

        const metricsY = pillsY + 100;
        drawMetricCards(ctx, data.metrics, 84, metricsY, 912, data.type === 'partido' ? 350 : 300, theme, 2);

        if (data.decisions?.length) {
            drawStoryDecisions(ctx, 84, metricsY + (data.type === 'partido' ? 390 : 340), 912, 188, data.decisions, theme);
        }

        await drawSponsorsRow(ctx, 84, 1830, 912, theme, data.sponsors, false);
        drawBrandStamp(ctx, width, height, theme, data.brandText || 'choguileague.site');
        return canvas;
    }

    async function drawMatchScoreboard(ctx, x, y, width, height, data, theme, large) {
        ctx.fillStyle = theme.panel;
        roundRect(ctx, x, y, width, height, 32);
        ctx.fill();

        const logoSize = large ? 112 : 58;
        const leftLogoX = x + 24;
        const rightLogoX = x + width - logoSize - 24;
        const logoY = y + (large ? 94 : 66);

        await drawLogoBlock(ctx, leftLogoX, logoY, logoSize, data.sideALogo, data.sideAInitials || 'VI', theme, large ? 28 : 18);
        await drawLogoBlock(ctx, rightLogoX, logoY, logoSize, data.sideBLogo, data.sideBInitials || 'LO', theme, large ? 28 : 18);

        ctx.fillStyle = '#b8c2d3';
        ctx.font = large ? '700 22px Arial' : '700 18px Arial';
        ctx.fillText('VISITANTE', x + 30, y + 34);
        ctx.fillText('LOCAL', x + width - 110, y + 34);

        ctx.fillStyle = theme.inverseText;
        ctx.font = large ? '800 34px Arial' : '800 26px Arial';
        fitText(ctx, data.sideAName || 'Visitante', x + 150, y + (large ? 136 : 98), large ? 270 : 180, large ? 34 : 26, 18);
        fitText(ctx, data.sideBName || 'Local', x + 150, y + (large ? 186 : 132), large ? 270 : 180, large ? 34 : 26, 18);

        ctx.fillStyle = theme.accent;
        ctx.font = large ? '900 92px Arial' : '900 58px Arial';
        fitText(ctx, data.scoreline || '--', x + width / 2 - (large ? 100 : 60), y + (large ? 146 : 86), large ? 200 : 120, large ? 92 : 58, large ? 40 : 34);

        if (data.badgeMeta) {
            ctx.fillStyle = theme.textSub;
            ctx.font = large ? '700 26px Arial' : '700 20px Arial';
            fitText(ctx, data.badgeMeta, x + width / 2 - 180, y + (large ? 198 : 126), 360, large ? 26 : 20, 16);
        }
    }

    function drawDecisionStrip(ctx, x, y, width, height, decisions, theme) {
        const list = decisions.slice(0, 3);
        const gap = 14;
        const itemWidth = (width - gap * (list.length - 1)) / list.length;
        list.forEach((item, index) => {
            const itemX = x + index * (itemWidth + gap);
            ctx.fillStyle = theme.panelSoft;
            roundRect(ctx, itemX, y, itemWidth, height, 24);
            ctx.fill();
            ctx.fillStyle = '#b8c2d3';
            ctx.font = '700 16px Arial';
            ctx.fillText(cleanText(item.label), itemX + 18, y + 24);
            ctx.fillStyle = theme.inverseText;
            fitText(ctx, cleanText(item.name || '--'), itemX + 18, y + 52, itemWidth - 36, 22, 16);
            ctx.fillStyle = theme.textSub;
            ctx.font = '700 14px Arial';
            fitText(ctx, cleanText(item.meta || ''), itemX + 18, y + 66, itemWidth - 36, 14, 12);
        });
    }

    function drawStoryDecisions(ctx, x, y, width, height, decisions, theme) {
        if (!decisions.length) return;
        ctx.fillStyle = theme.panel;
        roundRect(ctx, x, y, width, height, 32);
        ctx.fill();
        ctx.fillStyle = '#b8c2d3';
        ctx.font = '700 26px Arial';
        ctx.fillText('Leyenda oficial del juego', x + 28, y + 42);

        decisions.slice(0, 3).forEach((item, index) => {
            const offsetY = y + 76 + index * 34;
            ctx.fillStyle = theme.accent;
            ctx.font = '800 18px Arial';
            ctx.fillText(cleanText(item.label), x + 28, offsetY);
            ctx.fillStyle = theme.inverseText;
            fitText(ctx, cleanText(item.name || '--'), x + 260, offsetY, width - 290, 20, 16);
        });
    }

    function normalizeMetric(label, value) {
        return { label: cleanText(label), value: cleanText(value) };
    }

    function normalizeDecision(label, name, meta) {
        return { label: cleanText(label), name: cleanText(name), meta: cleanText(meta) };
    }

    function resolveData() {
        if (!state.provider) return null;
        const raw = typeof state.provider.getData === 'function' ? state.provider.getData() : state.provider;
        if (!raw) return null;

        return {
            type: raw.type || 'equipo',
            tone: raw.tone || 'default',
            title: cleanText(raw.title || 'Chogui League'),
            subtitle: cleanText(raw.subtitle || ''),
            kicker: cleanText(raw.kicker || 'Chogui League'),
            tournamentName: cleanText(raw.tournamentName || ''),
            badge: cleanText(raw.badge || ''),
            meta: cleanText(raw.meta || ''),
            badgeLabel: cleanText(raw.badgeLabel || 'Resumen'),
            badgeValue: cleanText(raw.badgeValue || '--'),
            badgeMeta: cleanText(raw.badgeMeta || ''),
            logo: raw.logo || '/images/logos/chogui-league.png',
            secondaryLogo: raw.secondaryLogo || '',
            initials: cleanText(raw.initials || 'CL'),
            secondaryInitials: cleanText(raw.secondaryInitials || ''),
            fileName: cleanText(raw.fileName || raw.title || 'chogui-league'),
            linkLabel: cleanText(raw.linkLabel || 'Liga oficial'),
            shareUrl: raw.shareUrl || window.location.href,
            brandText: cleanText(raw.brandText || 'choguileague.site'),
            sponsors: Array.isArray(raw.sponsors) ? raw.sponsors : DEFAULT_SPONSORS,
            scoreline: cleanText(raw.scoreline || ''),
            sideAName: cleanText(raw.sideAName || ''),
            sideBName: cleanText(raw.sideBName || ''),
            sideALogo: raw.sideALogo || '',
            sideBLogo: raw.sideBLogo || '',
            sideAInitials: cleanText(raw.sideAInitials || ''),
            sideBInitials: cleanText(raw.sideBInitials || ''),
            metrics: (raw.metrics || []).map((item) => normalizeMetric(item.label, item.value)),
            decisions: (raw.decisions || []).map((item) => normalizeDecision(item.label, item.name, item.meta))
        };
    }

    async function downloadCanvas(canvas, fileName) {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${slugify(fileName)}.png`;
        link.click();
    }

    async function handleShareLink(button) {
        const data = resolveData();
        if (!data) {
            setFeedback('Todavía no hay datos listos para compartir.', true);
            return;
        }

        try {
            const payload = {
                title: data.title,
                text: data.subtitle || data.kicker,
                url: data.shareUrl
            };

            if (navigator.share) {
                await navigator.share(payload);
                setFeedback('Enlace compartido.');
                return;
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(data.shareUrl);
                setFeedback('Enlace copiado al portapapeles.');
                return;
            }

            window.prompt('Copia este enlace:', data.shareUrl);
            setFeedback('Enlace listo para copiar.');
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.error('Error compartiendo enlace:', error);
                setFeedback('No se pudo compartir el enlace.', true);
            }
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function handleDownload(button, mode) {
        const data = resolveData();
        if (!data) {
            setFeedback('Todavía no hay datos listos para descargar.', true);
            return;
        }

        try {
            if (button) button.disabled = true;
            setFeedback(mode === 'story' ? 'Generando story...' : 'Generando imagen...');
            const canvas = mode === 'story' ? await buildStoryCanvas(data) : await buildLandscapeCanvas(data);
            await downloadCanvas(canvas, `${data.fileName}-${mode === 'story' ? 'story' : 'card'}`);
            setFeedback(mode === 'story' ? 'Story descargada.' : 'Imagen descargada.');
        } catch (error) {
            console.error('Error generando imagen compartible:', error);
            setFeedback('No se pudo generar la imagen.', true);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function bindButtons() {
        if (state.initialized) return;
        state.initialized = true;

        const shareButton = document.querySelector('[data-share-link]');
        const cardButton = document.querySelector('[data-download-card]');
        const storyButton = document.querySelector('[data-download-story]');

        if (shareButton) {
            shareButton.addEventListener('click', async () => {
                shareButton.disabled = true;
                await handleShareLink(shareButton);
            });
        }

        if (cardButton) {
            cardButton.addEventListener('click', async () => {
                await handleDownload(cardButton, 'card');
            });
        }

        if (storyButton) {
            storyButton.addEventListener('click', async () => {
                await handleDownload(storyButton, 'story');
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

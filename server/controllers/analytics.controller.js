const pool = require('../config/database');

function sanitizeText(value, maxLength = 255) {
    if (value === undefined || value === null) return null;
    return String(value).trim().slice(0, maxLength) || null;
}

async function registrarVisita(req, res, next) {
    try {
        const {
            visitor_id,
            session_id,
            page_path,
            page_type,
            page_label,
            entity_id,
            torneo_id,
            referrer
        } = req.body || {};

        const visitorId = sanitizeText(visitor_id, 120);
        const sessionId = sanitizeText(session_id, 120);
        const pagePath = sanitizeText(page_path, 255);
        const pageType = sanitizeText(page_type, 60) || 'web';
        const pageLabel = sanitizeText(page_label, 160);
        const entityId = entity_id ? Number(entity_id) : null;
        const torneoId = torneo_id ? Number(torneo_id) : null;
        const userAgent = sanitizeText(req.get('user-agent'), 500);
        const safeReferrer = sanitizeText(referrer || req.get('referer'), 500);

        if (!visitorId || !sessionId || !pagePath) {
            return res.status(400).json({ error: 'visitor_id, session_id y page_path son requeridos' });
        }

        await pool.query(`
            INSERT INTO analytics_visits (
                visitor_id, session_id, page_path, page_type, page_label,
                entity_id, torneo_id, referrer, user_agent
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [
            visitorId,
            sessionId,
            pagePath,
            pageType,
            pageLabel,
            Number.isFinite(entityId) ? entityId : null,
            Number.isFinite(torneoId) ? torneoId : null,
            safeReferrer,
            userAgent
        ]);

        res.status(202).json({ success: true });
    } catch (error) {
        console.error('Error registrando visita:', error);
        next(error);
    }
}

async function obtenerResumen(req, res, next) {
    try {
        const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));

        const [totalsResult, topPagesResult, dailyResult] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')::INT AS pageviews_hoy,
                    COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')::INT AS visitantes_hoy,
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::INT AS pageviews_7d,
                    COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::INT AS visitantes_7d,
                    COUNT(*) FILTER (WHERE created_at >= NOW() - ($1::text || ' days')::interval)::INT AS pageviews_periodo,
                    COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - ($1::text || ' days')::interval)::INT AS visitantes_periodo,
                    COUNT(DISTINCT session_id) FILTER (WHERE created_at >= NOW() - ($1::text || ' days')::interval)::INT AS sesiones_periodo
                FROM analytics_visits
            `, [days]),
            pool.query(`
                SELECT
                    page_type,
                    page_path,
                    COALESCE(page_label, page_path) AS label,
                    COUNT(*)::INT AS pageviews,
                    COUNT(DISTINCT visitor_id)::INT AS visitantes
                FROM analytics_visits
                WHERE created_at >= NOW() - ($1::text || ' days')::interval
                GROUP BY page_type, page_path, COALESCE(page_label, page_path)
                ORDER BY pageviews DESC, visitantes DESC, label ASC
                LIMIT 10
            `, [days]),
            pool.query(`
                SELECT
                    TO_CHAR(date_trunc('day', created_at), 'YYYY-MM-DD') AS fecha,
                    COUNT(*)::INT AS pageviews,
                    COUNT(DISTINCT visitor_id)::INT AS visitantes
                FROM analytics_visits
                WHERE created_at >= NOW() - INTERVAL '7 days'
                GROUP BY date_trunc('day', created_at)
                ORDER BY fecha ASC
            `)
        ]);

        res.json({
            days,
            totals: totalsResult.rows[0] || {},
            top_pages: topPagesResult.rows,
            daily: dailyResult.rows
        });
    } catch (error) {
        console.error('Error obteniendo resumen de analitica:', error);
        next(error);
    }
}

module.exports = {
    registrarVisita,
    obtenerResumen
};

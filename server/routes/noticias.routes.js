const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { adminLimiter } = require('../middleware/rateLimit');
const { notifyGeneralUpdate } = require('../services/sse.service');

const router = express.Router();
const columns = 'id, torneo_id, titulo, resumen, categoria, publicado, origen, fecha_publicacion, created_at';

function parseArticle(body) {
    const titulo = String(body.titulo || '').trim();
    const resumen = String(body.resumen || '').trim();
    const categoria = String(body.categoria || 'noticia');
    const torneoId = body.torneo_id === null || body.torneo_id === '' || body.torneo_id === undefined
        ? null : Number(body.torneo_id);
    if (!titulo || titulo.length > 180 || !resumen || resumen.length > 800 ||
        !['noticia', 'aviso'].includes(categoria) || (torneoId !== null && (!Number.isSafeInteger(torneoId) || torneoId < 1))) {
        return null;
    }
    return { titulo, resumen, categoria, torneoId, publicado: body.publicado === true };
}

const wrap = (handler) => async (req, res, next) => {
    try { await handler(req, res); } catch (error) { next(error); }
};

router.get('/', wrap(async (req, res) => {
    const torneoId = req.query.torneo_id ? Number(req.query.torneo_id) : null;
    if (torneoId !== null && (!Number.isSafeInteger(torneoId) || torneoId < 1)) return res.status(400).json({ message: 'Torneo inválido' });
    const result = await pool.query(`SELECT ${columns} FROM noticias
        WHERE publicado = TRUE AND fecha_publicacion <= NOW()
        AND (torneo_id IS NULL OR ($1::integer IS NOT NULL AND torneo_id = $1))
        ORDER BY fecha_publicacion DESC, id DESC LIMIT 20`, [torneoId]);
    res.json(result.rows);
}));

router.get('/admin', requireAdmin, wrap(async (req, res) => {
    const result = await pool.query(`SELECT ${columns} FROM noticias ORDER BY created_at DESC, id DESC LIMIT 100`);
    res.json(result.rows);
}));

router.post('/', requireAdmin, adminLimiter, requireCsrf, wrap(async (req, res) => {
    const article = parseArticle(req.body);
    if (!article) return res.status(400).json({ message: 'Revisa título, texto, categoría y torneo' });
    const result = await pool.query(`INSERT INTO noticias (torneo_id, titulo, resumen, categoria, publicado, fecha_publicacion)
        VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END) RETURNING ${columns}`,
    [article.torneoId, article.titulo, article.resumen, article.categoria, article.publicado]);
    notifyGeneralUpdate();
    res.status(201).json(result.rows[0]);
}));

router.put('/:id', requireAdmin, adminLimiter, requireCsrf, wrap(async (req, res) => {
    const article = parseArticle(req.body);
    if (!article || !/^\d+$/.test(req.params.id)) return res.status(400).json({ message: 'Artículo inválido' });
    const result = await pool.query(`UPDATE noticias SET torneo_id=$1, titulo=$2, resumen=$3, categoria=$4,
        publicado=$5, fecha_publicacion=CASE WHEN $5 THEN COALESCE(fecha_publicacion, NOW()) ELSE NULL END,
        updated_at=NOW() WHERE id=$6 RETURNING ${columns}`,
    [article.torneoId, article.titulo, article.resumen, article.categoria, article.publicado, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ message: 'Artículo no encontrado' });
    notifyGeneralUpdate();
    res.json(result.rows[0]);
}));

router.delete('/:id', requireAdmin, adminLimiter, requireCsrf, wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ message: 'Artículo inválido' });
    const result = await pool.query('DELETE FROM noticias WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ message: 'Artículo no encontrado' });
    notifyGeneralUpdate();
    res.json({ success: true });
}));

// A publishing agent or Make scenario can POST here once NEWS_WEBHOOK_TOKEN is configured.
// external_id makes retries safe; drafts remain private until explicitly published.
router.post('/ingest', adminLimiter, wrap(async (req, res) => {
    const secret = process.env.NEWS_WEBHOOK_TOKEN;
    const received = (req.get('Authorization') || '').replace(/^Bearer /, '');
    if (!secret || !received || Buffer.byteLength(secret) !== Buffer.byteLength(received) ||
        !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(received))) {
        return res.status(401).json({ message: 'Acceso denegado' });
    }
    const article = parseArticle(req.body);
    const externalId = String(req.body.external_id || '').trim();
    if (!article || !externalId || externalId.length > 120) return res.status(400).json({ message: 'Artículo o external_id inválido' });
    const result = await pool.query(`INSERT INTO noticias (torneo_id, titulo, resumen, categoria, publicado, origen, external_id, fecha_publicacion)
        VALUES ($1, $2, $3, $4, $5, 'integracion', $6, CASE WHEN $5 THEN NOW() ELSE NULL END)
        ON CONFLICT (external_id) DO NOTHING RETURNING ${columns}`,
    [article.torneoId, article.titulo, article.resumen, article.categoria, article.publicado, externalId]);
    if (result.rows.length) notifyGeneralUpdate();
    res.status(result.rows.length ? 201 : 200).json(result.rows[0] || { duplicated: true });
}));

module.exports = router;

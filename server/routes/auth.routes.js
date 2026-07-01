const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { authLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { loginSchema } = require('../schemas/auth.schema');

router.get('/csrf-token', authController.csrfToken);
router.get('/session', requireAuth, authController.session);
router.post('/login', authLimiter, requireCsrf, validateBody(loginSchema), authController.login);
router.post('/logout', requireAuth, requireCsrf, authController.logout);

module.exports = router;

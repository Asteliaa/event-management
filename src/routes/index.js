const router = require('express').Router();
const health = require('../controllers/health.controller');

// Версия 1 REST API: /api/v1/...
router.get('/health', health);

router.use('/auth', require('./auth.routes'));
router.use('/events', require('./event.routes'));
router.use('/registrations', require('./registration.routes'));
router.use('/reminders', require('./reminder.routes'));
router.use('/categories', require('./category.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;

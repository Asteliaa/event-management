const router = require('express').Router();
const h = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { notificationList, notificationUpdate } = require('../validators/misc');
const { idParam } = require('../validators/common');
const ctrl = require('../controllers/notification.controller');

// /api/v1/notifications – история уведомлений текущего пользователя
router.use(authenticate);
router.get('/', validate({ query: notificationList }), h(ctrl.list));
router.get('/unread-count', h(ctrl.unreadCount));
router.post('/read-all', h(ctrl.readAll));
router.patch('/:id', validate({ params: idParam, body: notificationUpdate }), h(ctrl.update));

module.exports = router;

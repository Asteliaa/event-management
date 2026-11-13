const router = require('express').Router();
const h = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const schemas = require('../validators/misc');
const { idParam } = require('../validators/common');
const ctrl = require('../controllers/reminder.controller');

// /api/v1/reminders – напоминания текущего пользователя
router.use(authenticate);
router.get('/', validate({ query: schemas.reminderList }), h(ctrl.list));
router.post('/', validate({ body: schemas.reminderCreate }), h(ctrl.create));
router.patch('/:id', validate({ params: idParam, body: schemas.reminderUpdate }), h(ctrl.update));
router.delete('/:id', validate({ params: idParam }), h(ctrl.remove));

module.exports = router;

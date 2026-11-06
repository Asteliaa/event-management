const router = require('express').Router();
const h = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate, optionalAuth, isAdmin } = require('../middleware/auth');
const schemas = require('../validators/event');
const { registrationList } = require('../validators/misc');
const { idParam } = require('../validators/common');
const ctrl = require('../controllers/event.controller');

// /api/v1/events
router.get('/', validate({ query: schemas.list }), h(ctrl.list));
router.get('/cities', h(ctrl.cities));
router.get('/:id', validate({ params: idParam }), optionalAuth, h(ctrl.getById));
router.get('/:id/similar', validate({ params: idParam }), h(ctrl.similar));
router.get('/:id/calendar.ics', validate({ params: idParam }), h(ctrl.calendar));

router.post('/', authenticate, isAdmin, validate({ body: schemas.create }), h(ctrl.create));
router.patch('/:id', authenticate, isAdmin, validate({ params: idParam, body: schemas.update }), h(ctrl.update));
router.delete('/:id', authenticate, isAdmin, validate({ params: idParam }), h(ctrl.remove));

// Вложенный ресурс: регистрации мероприятия
router.post('/:id/registrations', authenticate, validate({ params: idParam, body: schemas.register }), h(ctrl.register));
router.get('/:id/registrations', authenticate, isAdmin,
    validate({ params: idParam, query: registrationList }), h(ctrl.registrations));

module.exports = router;

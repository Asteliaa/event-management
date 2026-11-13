const router = require('express').Router();
const h = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate, optionalAuth, requireRole } = require('../middleware/auth');
const schemas = require('../validators/event');
const { registrationList, managedList } = require('../validators/misc');
const { idParam } = require('../validators/common');
const ctrl = require('../controllers/event.controller');

// /api/v1/events
router.get('/', validate({ query: schemas.list }), h(ctrl.list));
router.get('/cities', h(ctrl.cities));
// мероприятия текущего организатора (администратор с ?all=true – все)
router.get('/managed', authenticate, requireRole('organizer', 'admin'), validate({ query: managedList }), h(ctrl.managed));
router.get('/:id', validate({ params: idParam }), optionalAuth, h(ctrl.getById));
router.get('/:id/similar', validate({ params: idParam }), h(ctrl.similar));
router.get('/:id/calendar.ics', validate({ params: idParam }), optionalAuth, h(ctrl.calendar));

// создание – организаторы и администраторы; изменение и удаление – владелец или администратор (проверяет сервис)
router.post('/', authenticate, requireRole('organizer', 'admin'), validate({ body: schemas.create }), h(ctrl.create));
router.patch('/:id', authenticate, validate({ params: idParam, body: schemas.update }), h(ctrl.update));
router.delete('/:id', authenticate, validate({ params: idParam }), h(ctrl.remove));
router.get('/:id/stats', authenticate, validate({ params: idParam }), h(ctrl.stats));
// смена состояния публикации – отдельными действиями (владелец или администратор)
router.post('/:id/publish', authenticate, validate({ params: idParam }), h(ctrl.publish));
router.post('/:id/unpublish', authenticate, validate({ params: idParam }), h(ctrl.unpublish));
router.post('/:id/cancel', authenticate, validate({ params: idParam, body: schemas.cancel }), h(ctrl.cancel));

// Вложенный ресурс: регистрации мероприятия
router.post('/:id/registrations', authenticate, validate({ params: idParam, body: schemas.register }), h(ctrl.register));
router.get('/:id/registrations', authenticate,
    validate({ params: idParam, query: registrationList }), h(ctrl.registrations));

module.exports = router;

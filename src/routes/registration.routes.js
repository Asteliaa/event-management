const router = require('express').Router();
const h = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { registrationUpdate, registrationCancel } = require('../validators/misc');
const { idParam } = require('../validators/common');
const ctrl = require('../controllers/registration.controller');

// /api/v1/registrations – отметка посещения, комментарий и отмена участия
// (участник, организатор мероприятия или администратор)
router.use(authenticate);
router.patch('/:id', validate({ params: idParam, body: registrationUpdate }), h(ctrl.update));
router.delete('/:id', validate({ params: idParam, body: registrationCancel }), h(ctrl.cancel));

module.exports = router;

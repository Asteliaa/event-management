const router = require('express').Router();
const h = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate, isAdmin } = require('../middleware/auth');
const schemas = require('../validators/misc');
const { idParam } = require('../validators/common');
const ctrl = require('../controllers/admin.controller');

// /api/v1/admin – только для администраторов
router.use(authenticate, isAdmin);
router.get('/stats', h(ctrl.stats));
router.get('/users', validate({ query: schemas.userList }), h(ctrl.users));
router.patch('/users/:id', validate({ params: idParam, body: schemas.userUpdate }), h(ctrl.updateUser));
router.post('/users/:id/deactivate', validate({ params: idParam }), h(ctrl.deactivateUser));
router.post('/users/:id/reactivate', validate({ params: idParam }), h(ctrl.reactivateUser));
router.delete('/users/:id', validate({ params: idParam }), h(ctrl.removeUser));

module.exports = router;

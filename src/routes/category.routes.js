const router = require('express').Router();
const h = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate, isAdmin } = require('../middleware/auth');
const { category } = require('../validators/misc');
const { idParam } = require('../validators/common');
const ctrl = require('../controllers/category.controller');

// /api/v1/categories
router.get('/', h(ctrl.list));
router.post('/', authenticate, isAdmin, validate({ body: category }), h(ctrl.create));
router.patch('/:id', authenticate, isAdmin, validate({ params: idParam, body: category.partial() }), h(ctrl.update));
router.delete('/:id', authenticate, isAdmin, validate({ params: idParam }), h(ctrl.remove));

module.exports = router;

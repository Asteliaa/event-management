const router = require('express').Router();
const h = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authLimiter, resetIpLimiter, resetEmailLimiter } = require('../middleware/rateLimit');
const schemas = require('../validators/auth');
const { idParam } = require('../validators/common');
const { myRegistrations } = require('../validators/misc');
const ctrl = require('../controllers/auth.controller');

// /api/v1/auth
router.post('/register', authLimiter, validate({ body: schemas.register }), h(ctrl.register));
router.post('/login', authLimiter, validate({ body: schemas.login }), h(ctrl.login));

// восстановление пароля: письмо со ссылкой (ответ одинаков для любого адреса) и новый пароль по токену
router.post('/password/forgot', resetIpLimiter, validate({ body: schemas.forgotPassword }), resetEmailLimiter, h(ctrl.forgotPassword));
router.post('/password/reset', resetIpLimiter, validate({ body: schemas.resetPassword }), h(ctrl.resetPassword));

// /api/v1/auth/me – текущий пользователь и его данные
router.get('/me', authenticate, h(ctrl.me));
router.patch('/me', authenticate, validate({ body: schemas.updateProfile }), h(ctrl.updateMe));
router.put('/me/password', authenticate, validate({ body: schemas.changePassword }), h(ctrl.changePassword));
router.get('/me/registrations', authenticate,
    validate({ query: myRegistrations }),
    h(ctrl.myRegistrations));
router.post('/me/deactivate', authenticate, validate({ body: schemas.confirmPassword }), h(ctrl.deactivateMe));
router.delete('/me', authenticate, validate({ body: schemas.confirmPassword }), h(ctrl.deleteMe));
router.get('/me/favorites', authenticate, h(ctrl.myFavorites));
router.put('/me/favorites/:id', authenticate, validate({ params: idParam }), h(ctrl.addFavorite));
router.delete('/me/favorites/:id', authenticate, validate({ params: idParam }), h(ctrl.removeFavorite));

module.exports = router;

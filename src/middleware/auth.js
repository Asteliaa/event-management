const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { isValidId } = require('../utils/id');
const ApiError = require('../utils/ApiError');

const readToken = (req) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    return scheme === 'Bearer' && token ? token : null;
};

// Проверяет JWT и загружает пользователя из БД: так сразу действуют
// смена роли и блокировка, даже если токен выдан раньше
const loadUser = async (token) => {
    let payload;
    try {
        payload = jwt.verify(token, config.jwt.secret);
    } catch {
        throw ApiError.unauthorized('Недействительный или просроченный токен');
    }
    const user = isValidId(String(payload.id)) ? await User.findByPk(payload.id) : null;
    if (!user) throw ApiError.unauthorized('Пользователь не найден');
    if (user.blocked) throw ApiError.forbidden('Учетная запись заблокирована');
    return { id: String(user.id), email: user.email, name: user.name, role: user.role };
};

// Обязательная авторизация: без токена – 401
const authenticate = async (req, res, next) => {
    try {
        const token = readToken(req);
        if (!token) throw ApiError.unauthorized('Требуется авторизация: заголовок Authorization: Bearer <token>');
        req.user = await loadUser(token);
        next();
    } catch (err) {
        next(err);
    }
};

// Необязательная авторизация: публичный маршрут, но с токеном ответ дополняется
// данными пользователя (например, «вы зарегистрированы»)
const optionalAuth = async (req, res, next) => {
    const token = readToken(req);
    if (!token) return next();
    try {
        req.user = await loadUser(token);
    } catch {
        // недействительный токен на публичном маршруте просто игнорируется
    }
    next();
};

// Ролевая модель доступа (RBAC)
const ROLE_NAMES = { admin: 'администраторов', organizer: 'организаторов' };
const requireRole = (...roles) => (req, res, next) =>
    next(req.user && roles.includes(req.user.role) ? undefined
        : ApiError.forbidden(`Доступ только для ${roles.map((r) => ROLE_NAMES[r] || r).join(' и ')}`));

const isAdmin = requireRole('admin');

module.exports = { authenticate, optionalAuth, requireRole, isAdmin };

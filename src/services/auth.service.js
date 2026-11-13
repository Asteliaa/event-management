const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { sequelize, User } = require('../models');
const passwordReset = require('./password-reset.service');
const ApiError = require('../utils/ApiError');

// tv – версия токенов пользователя: после блокировки, деактивации, удаления или смены пароля
// версия в БД увеличивается и ранее выданные токены отклоняются
const signToken = (user) => jwt.sign(
    { id: String(user.id), role: user.role, tv: user.tokenVersion ?? 0 },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
);

const register = async ({ name, email, password }) => {
    if (await User.count({ where: { email } })) {
        throw ApiError.conflict('Пользователь с таким email уже существует', 'EMAIL_TAKEN');
    }
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    let user;
    try {
        user = await User.create({ name, email, passwordHash });
    } catch (err) {
        // два одновременных запроса с одним email: второй упрется в UNIQUE
        if (err.name === 'SequelizeUniqueConstraintError') {
            throw ApiError.conflict('Пользователь с таким email уже существует', 'EMAIL_TAKEN');
        }
        throw err;
    }
    return { user: user.toJSON(), token: signToken(user) };
};

const login = async ({ email, password }) => {
    const user = await User.scope('withPassword').findOne({ where: { email } });
    // одинаковый ответ для неизвестного email и неверного пароля: нельзя перебрать адреса
    const valid = user && await bcrypt.compare(password, user.passwordHash);
    if (!valid || user.status === 'deleted') throw ApiError.unauthorized('Неверный email или пароль');
    if (user.blocked) throw ApiError.forbidden('Учетная запись заблокирована');
    if (user.status === 'deactivated') {
        if (user.deactivatedBy === 'admin') {
            throw new ApiError(403, 'Учетная запись деактивирована администратором', { code: 'ACCOUNT_DEACTIVATED' });
        }
        // деактивацию, выполненную самим пользователем, отменяет вход с паролем;
        // reactivated: true – клиент сообщает, что учетная запись восстановлена
        await user.update({ status: 'active', deactivatedAt: null, deactivatedBy: null });
        return { user: user.toJSON(), token: signToken(user), reactivated: true };
    }
    return { user: user.toJSON(), token: signToken(user) };
};

const getMe = async (userId) => {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Пользователь не найден');
    return user;
};

const updateProfile = async (userId, data) => {
    const user = await getMe(userId);
    await user.update(data);
    return user;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
    const user = await User.scope('withPassword').findByPk(userId);
    if (!user) throw ApiError.notFound('Пользователь не найден');
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
        throw ApiError.badRequest('Текущий пароль указан неверно');
    }
    user.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    // другие сеансы (старые токены) завершаются, текущий получает новый токен;
    // ссылки восстановления пароля, выданные раньше, перестают действовать
    user.tokenVersion += 1;
    await sequelize.transaction(async (transaction) => {
        await user.save({ transaction });
        await passwordReset.revokeAll(user.id, transaction);
    });
    return { token: signToken(user) };
};

module.exports = { register, login, getMe, updateProfile, changePassword, signToken };

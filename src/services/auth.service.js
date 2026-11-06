const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');

const signToken = (user) => jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
);

const register = async ({ name, email, password }) => {
    if (await User.exists({ email })) {
        throw ApiError.conflict('Пользователь с таким email уже существует', 'EMAIL_TAKEN');
    }
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const user = await User.create({ name, email, passwordHash });
    return { user: user.toJSON(), token: signToken(user) };
};

const login = async ({ email, password }) => {
    const user = await User.findOne({ email }).select('+passwordHash');
    // одинаковый ответ для неизвестного email и неверного пароля: нельзя перебрать адреса
    const valid = user && await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw ApiError.unauthorized('Неверный email или пароль');
    if (user.blocked) throw ApiError.forbidden('Учетная запись заблокирована');
    return { user: user.toJSON(), token: signToken(user) };
};

const getMe = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('Пользователь не найден');
    return user;
};

const updateProfile = async (userId, data) => {
    const user = await User.findByIdAndUpdate(userId, data, { returnDocument: 'after', runValidators: true });
    if (!user) throw ApiError.notFound('Пользователь не найден');
    return user;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) throw ApiError.notFound('Пользователь не найден');
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
        throw ApiError.badRequest('Текущий пароль указан неверно');
    }
    user.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await user.save();
};

module.exports = { register, login, getMe, updateProfile, changePassword, signToken };

const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { isValidId } = require('../utils/id');

// Middleware Socket.IO: проверка JWT при рукопожатии (handshake).
// Клиент передает токен в io(url, { auth: { token } }); без токена соединение не устанавливается,
// а клиент получает событие connect_error с текстом ошибки
module.exports = async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Требуется авторизация'));
    }

    let payload;
    try {
        payload = jwt.verify(token, config.jwt.secret);
    } catch {
        return next(new Error('Недействительный или просроченный токен'));
    }

    try {
        const user = isValidId(String(payload.id)) ? await User.findByPk(payload.id) : null;
        if (!user || !user.canSignIn || (payload.tv ?? 0) !== user.tokenVersion) return next(new Error('Доступ запрещен'));
        socket.data.user = { id: String(user.id), email: user.email, name: user.name, role: user.role };
        next();
    } catch {
        next(new Error('Ошибка сервера'));
    }
};

const jwt = require('jsonwebtoken');

// Middleware Socket.IO: проверка JWT при рукопожатии (handshake).
// Клиент передает токен в io(url, { auth: { token } }); без токена соединение не устанавливается,
// а клиент получает событие connect_error с текстом ошибки
module.exports = (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Требуется авторизация'));
    }

    try {
        const { id, email, role } = jwt.verify(token, process.env.JWT_SECRET);
        socket.data.user = { id, email, role };
        next();
    } catch (error) {
        next(new Error('Недействительный или просроченный токен'));
    }
};

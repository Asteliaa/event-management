const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ message: "Требуется авторизация: заголовок Authorization: Bearer <token>" });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        res.status(401).json({ message: "Недействительный или просроченный токен" });
    }
};

const isAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Доступ только для администраторов" });
    }
    next();
};

module.exports = { authenticate, isAdmin };

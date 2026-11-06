const rateLimit = require('express-rate-limit');
const config = require('../config');

// Ограничение частоты попыток входа и регистрации с одного IP: защита от подбора пароля
const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.authMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => config.isTest && !process.env.TEST_RATE_LIMIT,
    handler: (req, res) => res.status(429).json({
        error: { status: 429, code: 'TOO_MANY_REQUESTS', message: 'Слишком много попыток, повторите через 15 минут' }
    })
});

module.exports = { authLimiter };

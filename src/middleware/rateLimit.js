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

const tooMany = (message) => (req, res) => res.status(429).json({
    error: { status: 429, code: 'TOO_MANY_REQUESTS', message }
});
const skip = () => config.isTest && !process.env.TEST_RATE_LIMIT;

// Восстановление пароля: запросы и попытки сброса с одного IP за 15 минут
const resetIpLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.resetIpMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    handler: tooMany('Слишком много запросов восстановления, повторите через 15 минут')
});

// Письма на один адрес за час (ставится после проверки тела: email уже нормализован).
// Ответ одинаков для существующих и несуществующих адресов
const resetEmailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.rateLimit.resetEmailMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    keyGenerator: (req) => `email:${req.body.email}`,
    handler: tooMany('Письмо на этот адрес уже отправлялось несколько раз, повторите через час')
});

module.exports = { authLimiter, resetIpLimiter, resetEmailLimiter };

// Единая точка чтения переменных окружения: остальной код не обращается к process.env напрямую
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

const config = {
    env,
    isTest: env === 'test',
    isProd: env === 'production',
    port: Number(process.env.PORT) || 3000,
    mongoUri: process.env.MONGO_URI,
    clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim()),
    jwt: {
        get secret() {
            return process.env.JWT_SECRET;
        },
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },
    bcryptRounds: 10,
    reminders: {
        // как часто планировщик проверяет наступившие напоминания
        intervalMs: Number(process.env.REMINDER_INTERVAL_MS) || 30_000,
        // автоматическое напоминание при регистрации: за сутки до начала
        defaultOffsetMinutes: 24 * 60
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000,
        authMax: Number(process.env.AUTH_RATE_LIMIT) || 20
    }
};

module.exports = config;

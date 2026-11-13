// Единая точка чтения переменных окружения: остальной код не обращается к process.env напрямую
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

const config = {
    env,
    isTest: env === 'test',
    isProd: env === 'production',
    port: Number(process.env.PORT) || 3000,
    db: {
        // postgres://user:password@host:5432/database
        get url() {
            return process.env.DATABASE_URL;
        },
        // DB_SSL=true – для управляемых облачных баз (Render, Supabase и т. п.)
        ssl: process.env.DB_SSL === 'true',
        logging: process.env.DB_LOGGING === 'true'
    },
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
        authMax: Number(process.env.AUTH_RATE_LIMIT) || 20,
        // восстановление пароля: запросы с одного IP за 15 минут и письма на один адрес за час
        resetIpMax: Number(process.env.RESET_RATE_LIMIT_IP) || 10,
        resetEmailMax: Number(process.env.RESET_RATE_LIMIT_EMAIL) || 3
    },
    // Доверенный адрес клиента для ссылок в письмах: берется из конфигурации, а не из заголовка Host запроса
    get appUrl() {
        return (process.env.APP_URL || config.clientUrl[0]).replace(/\/+$/, '');
    },
    passwordReset: {
        ttlMinutes: 30
    },
    // SMTP для писем (восстановление пароля). В разработке – Mailpit (SMTP_HOST=127.0.0.1, SMTP_PORT=1025);
    // без SMTP_HOST письма не отправляются (в журнал пишется только факт сбоя, без адреса и ссылки)
    mail: {
        get host() { return process.env.SMTP_HOST || ''; },
        get port() { return Number(process.env.SMTP_PORT) || 1025; },
        // true – SMTPS (обычно порт 465); иначе STARTTLS, если сервер его предлагает
        get secure() { return process.env.SMTP_SECURE === 'true'; },
        get user() { return process.env.SMTP_USER || ''; },
        get pass() { return process.env.SMTP_PASS || ''; },
        get from() { return process.env.MAIL_FROM || 'EventHub <no-reply@eventhub.local>'; }
    }
};

module.exports = config;

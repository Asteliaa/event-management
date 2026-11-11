// Точка входа: подключение к PostgreSQL, HTTP-сервер Express + Socket.IO, планировщик напоминаний
const http = require('http');
const config = require('./src/config');
const { connect: connectDB, sequelize } = require('./src/db');
const app = require('./src/app');
const createSocketServer = require('./src/socket');
const reminderScheduler = require('./src/jobs/reminderScheduler');
const migrator = require('./src/db/migrator');

const start = async () => {
    if (!config.jwt.secret) throw new Error('Не задана переменная окружения JWT_SECRET');
    await connectDB();
    // Сервер не стартует на схеме, которая отстает от кода: миграции применяются явно (npm run db:migrate)
    const pending = await migrator.pending();
    if (pending.length) {
        throw new Error(`Не применены миграции: ${pending.map((m) => m.name).join(', ')}. Выполните npm run db:migrate`);
    }
    const server = http.createServer(app);
    createSocketServer(server);
    reminderScheduler.start();
    server.listen(config.port, () => {
        console.log(`Сервер: http://localhost:${config.port}/api/v1, документация: http://localhost:${config.port}/api/docs`);
    });

    // Корректное завершение по сигналу (docker stop, Ctrl+C)
    const shutdown = () => server.close(async () => {
        await sequelize.close();
        process.exit(0);
    });
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
};

if (require.main === module) {
    start().catch((err) => {
        console.error('Ошибка запуска:', err.message);
        process.exit(1);
    });
}

module.exports = app;

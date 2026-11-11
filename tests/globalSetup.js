// Перед прогоном тестов: отдельная тестовая база PostgreSQL пересоздается с нуля и получает схему из миграций.
// Защита от запуска на рабочей или учебной базе: имя базы обязано оканчиваться на _test
module.exports = async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
        throw new Error('Не задан TEST_DATABASE_URL (например, postgres://user:pass@localhost:5432/eventhub_test)');
    }
    const dbName = new URL(url).pathname.slice(1);
    if (!/_test$/.test(dbName)) {
        throw new Error(`Тесты очищают базу, поэтому имя базы должно оканчиваться на _test (сейчас: ${dbName})`);
    }
    process.env.DATABASE_URL = url;
    const { sequelize } = require('../src/db');
    const migrator = require('../src/db/migrator');
    await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrator.up();
    await sequelize.close();
};

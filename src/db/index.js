// Подключение к PostgreSQL через Sequelize (один экземпляр на процесс)
const { Sequelize } = require('sequelize');
const pg = require('pg');
const config = require('../config');

// bigint (int8) драйвер pg и так возвращает строкой – идентификаторы в API остаются строками.
// Явно оставляем это поведение: преобразование в Number потеряло бы точность после 2^53
pg.defaults.parseInt8 = false;

const options = {
    dialect: 'postgres',
    logging: config.db.logging ? console.log : false,
    define: { underscored: true },
    pool: { max: 10, min: 0, idle: 10_000 },
    dialectOptions: config.db.ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {}
};

// Без DATABASE_URL экземпляр создается, но не подключается: модели можно загрузить
// (например, для генерации документации), а connect() сообщит об ошибке
const sequelize = config.db.url ? new Sequelize(config.db.url, options) : new Sequelize(options);

// Адрес базы без пароля – для журналов и проверок «куда подключаемся»
const describeTarget = (url = config.db.url) => {
    if (!url) return '(DATABASE_URL не задан)';
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
};

const connect = async () => {
    if (!config.db.url) throw new Error('Не задана переменная окружения DATABASE_URL');
    await sequelize.authenticate();
    if (!config.isTest) console.log(`PostgreSQL connected: ${describeTarget()}`);
    return sequelize;
};

module.exports = { sequelize, connect, describeTarget };

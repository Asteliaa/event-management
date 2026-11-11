// Версионируемые миграции схемы (Umzug). Примененные миграции записываются в таблицу sequelize_meta
// (имя файла миграции), поэтому повторный запуск применяет только новые
const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');
const { sequelize } = require('./index');

const migrator = new Umzug({
    migrations: { glob: ['migrations/*.js', { cwd: path.join(__dirname, '..', '..') }] },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: undefined
});

module.exports = migrator;

// Миграции схемы БД: npm run db:migrate [-- up|down|status]
//   up      – применить все новые миграции (по умолчанию)
//   down    – откатить последнюю миграцию
//   status  – показать примененные и ожидающие миграции
const { sequelize, connect, describeTarget } = require('../src/db');
const migrator = require('../src/db/migrator');

async function main() {
    const command = process.argv[2] || 'up';
    console.log(`База данных: ${describeTarget()}`);
    await connect();
    if (command === 'up') {
        const done = await migrator.up();
        console.log(done.length ? `Применено: ${done.map((m) => m.name).join(', ')}` : 'Новых миграций нет');
    } else if (command === 'down') {
        const done = await migrator.down();
        console.log(done.length ? `Откачено: ${done.map((m) => m.name).join(', ')}` : 'Откатывать нечего');
    } else if (command === 'status') {
        const executed = await migrator.executed();
        const pending = await migrator.pending();
        console.log(`Применены: ${executed.map((m) => m.name).join(', ') || '—'}`);
        console.log(`Ожидают: ${pending.map((m) => m.name).join(', ') || '—'}`);
    } else {
        throw new Error(`Неизвестная команда: ${command} (up, down, status)`);
    }
}

main()
    .catch((err) => {
        console.error('Ошибка миграции:', err.message);
        process.exitCode = 1;
    })
    .finally(() => sequelize.close());

/**
 * Создание баз данных PostgreSQL для приложения и тестов (npm run db:create).
 * Имена баз берутся из DATABASE_URL и TEST_DATABASE_URL в файле .env.
 * Таблица events создается самим приложением при первом запуске.
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');

const urls = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL].filter(Boolean);

async function create(connectionString) {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount) {
      console.log(`База «${name}» уже существует`);
    } else {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      console.log(`База «${name}» создана`);
    }
  } finally {
    await client.end();
  }
}

(async () => {
  if (!urls.length) {
    console.error('Задайте DATABASE_URL в файле .env (образец – .env.example)');
    process.exit(1);
  }
  for (const u of urls) await create(u);
})().catch((err) => {
  console.error(`Не удалось создать базу: ${err.message}`);
  process.exit(1);
});

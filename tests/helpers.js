/**
 * Общие помощники для тестов.
 * Тесты работают с отдельной базой TEST_DATABASE_URL (по умолчанию eventhub_pz1_test),
 * каждый файл тестов – в своей схеме, поэтому файлы можно запускать параллельно.
 * Если тестовой базы нет, она создается автоматически.
 */
process.env.NODE_ENV = 'test';
require('dotenv').config({ quiet: true });
const { before, after } = require('node:test');
const { Client } = require('pg');
if (!process.env.PZ1_NO_TEST_DB) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    || 'postgres://postgres:postgres@localhost:5432/eventhub_pz1_test';
}
process.env.DB_SCHEMA = 't_' + require('path').basename(process.argv[1] || 'x', '.js')
  .toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
// Журнал запросов тестов – во временной папке, а не в logs/ проекта
const fs = require('fs');
const os = require('os');
const path = require('path');
if (!process.env.LOG_DIR) {
  process.env.LOG_DIR = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pz1-')), 'logs');
}
const { toISODate } = require('../utils/dates');

/** Дата через n дней от сегодня в формате YYYY-MM-DD. */
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Корректные данные формы; поля можно переопределить. */
function validForm(overrides = {}) {
  return {
    title: 'Митап по Node.js',
    type: 'meetup',
    format: 'offline',
    date: daysFromNow(10),
    time: '18:30',
    location: 'Минск, ул. Гикало, 9',
    organizer: 'Сообщество Node.js',
    capacity: '50',
    description: 'Доклады и нетворкинг',
    ...overrides
  };
}

/** Кодирует объект в application/x-www-form-urlencoded (массивы – повтором ключа). */
function encode(obj) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v !== undefined) params.append(k, v);
  }
  return params.toString();
}

/** Создает тестовую базу, если ее нет (подключение к служебной базе postgres). */
async function createTestDatabase() {
  const url = new URL(process.env.DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString(), connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } catch (err) {
    // Несколько файлов тестов создают базу одновременно: «уже существует» – не ошибка
    if (err.code !== '42P04' && err.code !== '23505') throw err;
  } finally {
    await client.end();
  }
}

/** Заполняет таблицу до лимита MAX_EVENTS одним SQL-запросом. */
async function fillToLimit() {
  const db = require('../data/db');
  const { MAX_EVENTS, count } = require('../data/events');
  const n = MAX_EVENTS - await count();
  await db.query(`INSERT INTO events (title, type, format, date, time, location, capacity, organizer)
    SELECT 'x' || g, 'meetup', 'offline', CURRENT_DATE + 1, '18:00', 'Минск', 1, 'Тест'
    FROM generate_series(1, $1) AS g`, [n]);
}

// Тесты базы «остановлена» подменяют DATABASE_URL сами и тестовую базу не создают
if (!process.env.PZ1_NO_TEST_DB) {
  before(async () => {
    try {
      await createTestDatabase();
    } catch (err) {
      throw new Error(`Нет подключения к PostgreSQL для тестов (${process.env.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@')}): ${err.message}. Задайте TEST_DATABASE_URL в .env.`);
    }
  });
}
after(() => require('../data/db').close());

module.exports = { daysFromNow, validForm, encode, fillToLimit };

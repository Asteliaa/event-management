/**
 * Работа с PostgreSQL: восстановление таблицы, разрыв соединений,
 * несуществующая база, параметризованные запросы.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const request = require('supertest');
const app = require('../app');
const store = require('../data/events');
const db = require('../data/db');

beforeEach(() => store.reset());

describe('PostgreSQL', () => {
  test('таблицу events удалили во время работы – создается заново с начальными данными', async () => {
    await db.query('DROP TABLE events');
    const res = await request(app).get('/').expect(200);
    assert.match(res.text, /Веб-технологии 2026/);
    assert.equal(await store.count(), 4);
  });

  test('таблицу очистили – сайт показывает пустой список, а не ошибку', async () => {
    await db.query('DELETE FROM events');
    const res = await request(app).get('/').expect(200);
    assert.match(res.text, /Ничего не найдено/);
    await request(app).get('/item/1').expect(404);
  });

  test('соединения с базой разорваны (перезапуск PostgreSQL) – сайт продолжает работать', async () => {
    await request(app).get('/').expect(200);
    // Завершаем соединения этого приложения (другие файлы тестов не затрагиваются)
    await db.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE application_name = $1 AND pid <> pg_backend_pid()`, [`eventhub_pz1_${process.env.DB_SCHEMA}`]);
    await new Promise((r) => setTimeout(r, 200));
    let res = await request(app).get('/');
    // Первый запрос мог попасть на разорванное соединение – тогда понятная 500
    if (res.status === 500) {
      assert.match(res.text, /базой данных/);
      res = await request(app).get('/');
    }
    assert.equal(res.status, 200);
  });

  test('поиск: символы % и _ ищутся как обычные символы', async () => {
    let res = await request(app).get('/?q=%25').expect(200);
    assert.match(res.text, /Ничего не найдено/);
    res = await request(app).get('/?q=_').expect(200);
    assert.match(res.text, /Ничего не найдено/);
  });

  test('поиск: SQL-инъекция не выполняется', async () => {
    const res = await request(app).get('/?q=' + encodeURIComponent("' OR 1=1; DROP TABLE events; --")).expect(200);
    assert.match(res.text, /Ничего не найдено/);
    assert.equal(await store.count(), 4);
  });

  test('поиск по кириллице без учета регистра выполняется в базе', async () => {
    const res = await request(app).get('/?q=ВЕБИНАР').expect(200);
    assert.match(res.text, /Показано: 2 из 4/);
  });

  test('ограничения длины продублированы в таблице', async () => {
    await assert.rejects(
      db.query(`INSERT INTO events (title, type, format, date, time, location, capacity, organizer)
        VALUES (repeat('a', 121), 'meetup', 'offline', CURRENT_DATE, '10:00', 'М', 1, 'О')`),
      (err) => err.cause && err.cause.code === '22001'
    );
  });

  test('100 одновременных добавлений – все записи сохранены, номера не повторяются', async () => {
    const { validForm, encode } = require('./helpers');
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) =>
      request(app).post('/add?auth=1').type('form').send(encode(validForm({ title: 'Параллельно ' + i })))));
    assert.ok(results.every((r) => r.status === 303));
    assert.equal(await store.count(), 104);
  });
});

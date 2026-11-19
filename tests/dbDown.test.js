/**
 * База данных недоступна: сервер PostgreSQL остановлен, неверный адрес или имя базы.
 * Сайт не падает: страницы с данными отвечают 500 с понятным сообщением,
 * системный текст ошибки (ECONNREFUSED и т. п.) пользователю не показывается.
 */
// Порт, на котором заведомо нет PostgreSQL (имитация остановленной базы)
process.env.PZ1_NO_TEST_DB = '1';
process.env.TEST_DATABASE_URL = '';
process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:1/eventhub_pz1';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validForm, encode } = require('./helpers');
const request = require('supertest');
const app = require('../app');
const db = require('../data/db');

const DOWN = /Нет соединения с базой данных/;
const SYSTEM = /ECONNREFUSED|127\.0\.0\.1|connect|postgres:\/\//i;

describe('PostgreSQL остановлен', () => {
  test('главная → 500 с понятным сообщением', async () => {
    const res = await request(app).get('/').expect(500);
    assert.match(res.text, /Внутренняя ошибка сервера/);
    assert.match(res.text, DOWN);
    assert.doesNotMatch(res.text, SYSTEM);
  });

  test('карточка мероприятия → 500', async () => {
    const res = await request(app).get('/item/1').expect(500);
    assert.match(res.text, DOWN);
  });

  test('добавление мероприятия → 500, данные не теряются молча', async () => {
    const res = await request(app).post('/add?auth=1').type('form').send(encode(validForm())).expect(500);
    assert.match(res.text, DOWN);
  });

  test('ошибки формы показываются и без базы (до обращения к ней)', async () => {
    await request(app).post('/add?auth=1').type('form').send('title=').expect(400);
  });

  test('страницы без данных работают: вход, форма, стили, 404', async () => {
    await request(app).get('/login').expect(200);
    await request(app).get('/add?auth=1').expect(200);
    await request(app).get('/css/style.css').expect(200);
    await request(app).get('/nope').expect(404);
  });

  test('на странице 500 организатор остается организатором', async () => {
    const res = await request(app).get('/?auth=1').expect(500);
    assert.match(res.text, /Организатор/);
  });

  test('ответ приходит быстро, страница не «зависает»', async () => {
    const start = Date.now();
    await request(app).get('/').expect(500);
    assert.ok(Date.now() - start < 4000);
  });
});

describe('Ошибки настроек подключения', () => {
  test('несуществующий сервер базы', async () => {
    await db.close();
    process.env.DATABASE_URL = 'postgres://postgres:postgres@no-such-host.invalid:5432/eventhub_pz1';
    const res = await request(app).get('/').expect(500);
    assert.match(res.text, /Не найден сервер базы данных|Нет соединения с базой данных/);
    assert.doesNotMatch(res.text, /ENOTFOUND|getaddrinfo/);
  });
});

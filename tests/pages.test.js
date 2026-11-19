/**
 * Страницы, авторизация, маршруты и обработка ошибок.
 * Запуск: npm test
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const request = require('supertest');
const app = require('../app');
const store = require('../data/events');

beforeEach(() => store.reset());

describe('Главная страница GET /', () => {
  test('гость видит список из массива', async () => {
    const res = await request(app).get('/').expect(200).expect('Content-Type', /html/);
    assert.match(res.text, /Конференция «Веб-технологии 2026»/);
    assert.match(res.text, /Вебинар: Middleware в Express.js/);
    assert.match(res.text, /Гость/);
    assert.doesNotMatch(res.text, /\+ Добавить мероприятие/);
  });

  test('организатор (?auth=1) видит кнопку добавления, ссылки сохраняют auth=1', async () => {
    const res = await request(app).get('/?auth=1').expect(200);
    assert.match(res.text, /Организатор/);
    assert.match(res.text, /\+ Добавить мероприятие/);
    assert.match(res.text, /href="\/item\/1\?auth=1"/);
  });

  for (const qs of ['auth=0', 'auth=true', 'auth=', 'auth=1&auth=1', 'auth[]=1', 'AUTH=1', 'auth=%201']) {
    test(`?${qs} не дает прав организатора`, async () => {
      const res = await request(app).get(`/?${qs}`).expect(200);
      assert.match(res.text, /user__name">Гость/);
    });
  }

  test('фильтр по типу', async () => {
    const res = await request(app).get('/?type=webinar').expect(200);
    assert.match(res.text, /Вебинар: Middleware/);
    assert.doesNotMatch(res.text, /Встреча выпускников/);
  });

  test('неизвестный тип – предупреждение и все записи', async () => {
    const res = await request(app).get('/?type=party').expect(200);
    assert.match(res.text, /Неизвестный тип/);
    assert.match(res.text, /Встреча выпускников/);
  });

  test('тип __proto__ не ломает фильтр', async () => {
    const res = await request(app).get('/?type=__proto__').expect(200);
    assert.match(res.text, /Неизвестный тип/);
  });

  test('поиск без учета регистра', async () => {
    const res = await request(app).get('/?q=' + encodeURIComponent('ВЕБИНАР')).expect(200);
    assert.match(res.text, /Шаблонизатор EJS/);
    assert.doesNotMatch(res.text, /Встреча выпускников/);
  });

  test('поиск без результатов', async () => {
    const res = await request(app).get('/?q=qwertyzzz').expect(200);
    assert.match(res.text, /Ничего не найдено/);
  });

  test('поиск: повтор параметра q не ломает страницу', async () => {
    const res = await request(app).get('/?q=a&q=b').expect(200);
    assert.match(res.text, /поиск не применен/);
  });

  test('поиск: длинная строка сокращается', async () => {
    const res = await request(app).get('/?q=' + 'я'.repeat(500)).expect(200);
    assert.match(res.text, /сокращен до 100/);
  });

  test('поиск: HTML в запросе экранируется', async () => {
    const res = await request(app).get('/?q=' + encodeURIComponent('"><script>alert(1)</script>')).expect(200);
    assert.doesNotMatch(res.text, /<script>alert\(1\)<\/script>/);
    assert.match(res.text, /&lt;script&gt;/);
  });

  for (const created of ['abc', '999', '-1', '1e3']) {
    test(`?created=${created} игнорируется`, async () => {
      const res = await request(app).get(`/?created=${created}`).expect(200);
      assert.doesNotMatch(res.text, /добавлено\./);
    });
  }

  test('HEAD / отвечает 200', async () => {
    await request(app).head('/').expect(200);
  });
});

describe('Детальная страница GET /item/:id', () => {
  test('существующая запись', async () => {
    const res = await request(app).get('/item/2').expect(200);
    assert.match(res.text, /Вебинар: Middleware в Express.js/);
    assert.match(res.text, /Онлайн/);
  });

  for (const id of ['999', '0', 'abc', '-1', '1.5', '01', '1e2', '99999999999999999999', '%20', 'null', 'undefined', 'NaN']) {
    test(`id=${id} → 404`, async () => {
      const res = await request(app).get(`/item/${id}`).expect(404);
      assert.match(res.text, /Мероприятие не найдено/);
    });
  }

  test('некорректная кодировка в URL → 400, а не 500', async () => {
    const res = await request(app).get('/item/%E0%A4%A').expect(400);
    assert.match(res.text, /Некорректный запрос/);
  });

  test('/item без id → 404', async () => {
    await request(app).get('/item').expect(404);
    await request(app).get('/item/').expect(404);
  });

  test('/item/1/extra → 404', async () => {
    await request(app).get('/item/1/extra').expect(404);
  });
});

describe('Имитация авторизации', () => {
  test('гость на /add → редирект на /login', async () => {
    const res = await request(app).get('/add').expect(303);
    assert.equal(res.headers.location, '/login?next=%2Fadd');
  });

  test('гость отправляет POST /add → редирект, запись не добавлена', async () => {
    const before = store.count();
    await request(app).post('/add').type('form').send('title=Взлом&type=meetup').expect(303);
    assert.equal(store.count(), before);
  });

  test('POST /add?auth=0 → редирект', async () => {
    await request(app).post('/add?auth=0').type('form').send('title=x').expect(303);
  });

  test('страница входа: ссылка ведет на ?next с auth=1', async () => {
    const res = await request(app).get('/login?next=/add').expect(200);
    assert.match(res.text, /href="\/add\?auth=1"/);
  });

  for (const next of ['//evil.com', 'http://evil.com', 'https://evil.com/add', '/\\evil.com', 'javascript:alert(1)', '/add?x=1', '/' + 'a'.repeat(300)]) {
    test(`next=${next.slice(0, 30)} заменяется на /`, async () => {
      const res = await request(app).get('/login?next=' + encodeURIComponent(next)).expect(200);
      assert.match(res.text, /href="\/\?auth=1"/);
      assert.doesNotMatch(res.text, /evil/);
    });
  }
});

describe('Ошибки 404, 405, 500', () => {
  test('несуществующий адрес → 404.ejs', async () => {
    const res = await request(app).get('/no-such-page').expect(404);
    assert.match(res.text, /Страница не найдена/);
  });

  test('адрес с HTML в 404 экранируется', async () => {
    const res = await request(app).get('/<script>alert(1)</script>').expect(404);
    assert.doesNotMatch(res.text, /<script>alert/);
  });

  test('очень длинный адрес → 404, адрес сокращен', async () => {
    const res = await request(app).get('/' + 'x'.repeat(5000)).expect(404);
    assert.ok(res.text.length < 20000);
  });

  test('тестовых маршрутов /error больше нет', async () => {
    await request(app).get('/error').expect(404);
  });

  for (const [method, path, allow] of [['put', '/', 'GET, HEAD'], ['delete', '/item/1', 'GET, HEAD'], ['patch', '/add', 'GET, HEAD, POST'], ['post', '/', 'GET, HEAD'], ['post', '/login', 'GET, HEAD']]) {
    test(`${method.toUpperCase()} ${path} → 405`, async () => {
      const res = await request(app)[method](path).expect(405);
      assert.equal(res.headers.allow, allow);
    });
  }
});

describe('Заголовки и статика', () => {
  test('общие заголовки', async () => {
    const res = await request(app).get('/').expect(200);
    assert.equal(res.headers['x-powered-by'], 'EventHub PZ1');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  });

  test('CSS отдается', async () => {
    await request(app).get('/css/style.css').expect(200).expect('Content-Type', /css/);
  });

  for (const path of ['/../server.js', '/css/../../app.js', '/%2e%2e/server.js', '/package.json', '/views/index.ejs', '/.gitignore']) {
    test(`исходники не отдаются: ${path}`, async () => {
      const res = await request(app).get(path);
      assert.ok([400, 403, 404].includes(res.status), `статус ${res.status}`);
      assert.doesNotMatch(res.text, /require\(/);
    });
  }
});

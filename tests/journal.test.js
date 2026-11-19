/**
 * Журнал запросов в файле: «поломки» папки и файла.
 * Проверяется, что приложение восстанавливает журнал, когда это возможно,
 * а иначе показывает страницу 500 с понятным (не системным) сообщением.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('./helpers');
const request = require('supertest');
const app = require('../app');
const store = require('../data/events');
const { LOG_DIR, LOG_FILE } = require('../utils/journal');

const { execFileSync } = require('child_process');

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const isWindows = process.platform === 'win32';

/**
 * Запрещает чтение файла. В Windows chmod не ограничивает чтение,
 * поэтому используется icacls: запрет на чтение данных (RD) для текущего пользователя,
 * дозапись в журнал при этом остается разрешенной.
 */
function denyRead(file) {
  if (isWindows) execFileSync('icacls', [file, '/deny', `${process.env.USERNAME}:(RD)`], { stdio: 'ignore' });
  else fs.chmodSync(file, 0o200);
}

function allowRead(file) {
  if (isWindows) execFileSync('icacls', [file, '/remove:d', process.env.USERNAME], { stdio: 'ignore' });
  else fs.chmodSync(file, 0o644);
}

/** Возвращает папку журнала в исходное состояние. */
function cleanLogDir() {
  fs.rmSync(LOG_DIR, { recursive: true, force: true });
}

const readLog = () => fs.readFileSync(LOG_FILE, 'utf8');

beforeEach(() => {
  store.reset();
  cleanLogDir();
});

describe('Запись журнала', () => {
  test('запрос записывается в файл: время, метод, URL', async () => {
    await request(app).get('/item/1?auth=1').expect(200);
    assert.match(readLog(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} GET \/item\/1\?auth=1\n$/);
  });

  test('POST тоже записывается', async () => {
    await request(app).post('/add?auth=1').type('form').send('title=').expect(400);
    assert.match(readLog(), /POST \/add\?auth=1/);
  });

  test('огромный URL сокращается до 200 символов', async () => {
    await request(app).get('/' + 'x'.repeat(5000)).expect(404);
    const line = readLog().trim();
    assert.ok(line.length < 260, `длина строки ${line.length}`);
  });

  test('переводы строк в URL не создают поддельных строк журнала', async () => {
    await request(app).get('/a%0AGET%20/fake').expect(404);
    assert.equal(readLog().trim().split('\n').length, 1);
  });
});

describe('Восстановление журнала', () => {
  test('файл удален – создается заново', async () => {
    await request(app).get('/').expect(200);
    fs.unlinkSync(LOG_FILE);
    await request(app).get('/item/2').expect(200);
    assert.match(readLog(), /GET \/item\/2/);
  });

  test('файл переименован – создается новый, старый не трогается', async () => {
    await request(app).get('/').expect(200);
    fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'old.log'));
    await request(app).get('/item/3').expect(200);
    assert.match(readLog(), /GET \/item\/3/);
    assert.match(fs.readFileSync(path.join(LOG_DIR, 'old.log'), 'utf8'), /GET \//);
  });

  test('папка logs удалена – создается заново', async () => {
    await request(app).get('/').expect(200);
    fs.rmSync(LOG_DIR, { recursive: true });
    await request(app).get('/').expect(200);
    assert.ok(fs.existsSync(LOG_FILE));
  });
});

describe('Журнал нельзя восстановить – страница 500 с понятным сообщением', () => {
  test('вместо файла requests.log создана папка', async () => {
    fs.mkdirSync(LOG_FILE, { recursive: true });
    const res = await request(app).get('/').expect(500);
    assert.match(res.text, /Внутренняя ошибка сервера/);
    assert.match(res.text, /находится папка, а не файл журнала/);
    assert.doesNotMatch(res.text, /EISDIR|illegal operation/i);
  });

  test('на странице 500 организатор остается организатором (авторизация раньше журнала)', async () => {
    fs.mkdirSync(LOG_FILE, { recursive: true });
    const res = await request(app).get('/?auth=1').expect(500);
    assert.match(res.text, /Организатор/);
    assert.doesNotMatch(res.text, /Войти/);
  });

  test('сайт снова работает, как только папку убрали (без перезапуска)', async () => {
    fs.mkdirSync(LOG_FILE, { recursive: true });
    await request(app).get('/').expect(500);
    fs.rmSync(LOG_FILE, { recursive: true });
    await request(app).get('/').expect(200);
  });

  test('вместо папки logs создан файл', async () => {
    fs.mkdirSync(path.dirname(LOG_DIR), { recursive: true });
    fs.writeFileSync(LOG_DIR, 'не папка');
    const res = await request(app).get('/').expect(500);
    assert.match(res.text, /должна быть папкой/);
    assert.doesNotMatch(res.text, /ENOTDIR|EEXIST/);
  });

  test('ошибка журнала при POST – форма не обрабатывается, запись не добавляется', async () => {
    fs.mkdirSync(LOG_FILE, { recursive: true });
    const before = await store.count();
    await request(app).post('/add?auth=1').type('form').send('title=x').expect(500);
    assert.equal(await store.count(), before);
  });

  test('стили страницы 500 отдаются, хотя журнал сломан', async () => {
    fs.mkdirSync(LOG_FILE, { recursive: true });
    await request(app).get('/css/style.css').expect(200);
  });

  test('нет прав на запись в файл', { skip: isRoot && 'запущено от root: права не ограничивают' }, async () => {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, '');
    fs.chmodSync(LOG_FILE, 0o444);
    try {
      const res = await request(app).get('/').expect(500);
      assert.match(res.text, /Нет доступа к журналу запросов/);
    } finally {
      fs.chmodSync(LOG_FILE, 0o644);
    }
  });
});

describe('Страница журнала GET /logs', () => {
  test('гостя перенаправляет на вход', async () => {
    await request(app).get('/logs').expect(303);
  });

  test('организатор видит записи, новые сверху', async () => {
    await request(app).get('/item/1').expect(200);
    await request(app).get('/item/2').expect(200);
    const res = await request(app).get('/logs?auth=1').expect(200);
    const i1 = res.text.indexOf('/item/1');
    const i2 = res.text.indexOf('/item/2');
    assert.ok(i2 > 0 && i1 > i2, 'новые записи должны быть выше');
  });

  test('HTML в журнале экранируется', async () => {
    await request(app).get('/<b>x</b>').expect(404);
    const res = await request(app).get('/logs?auth=1').expect(200);
    assert.doesNotMatch(res.text, /<b>x<\/b>/);
  });

  test('большой файл журнала читается только с конца', async () => {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, '2026-01-01 00:00:00 GET /old\n'.repeat(200000));
    const res = await request(app).get('/logs?auth=1').expect(200);
    assert.ok(res.text.length < 200000);
  });

  test('нет прав на чтение файла журнала', { skip: isRoot && 'запущено от root: права не ограничивают' }, async () => {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, '');
    denyRead(LOG_FILE);
    try {
      // Убеждаемся, что запрет действительно работает в этой системе
      assert.throws(() => fs.readFileSync(LOG_FILE), /EACCES|EPERM/);
      const res = await request(app).get('/logs?auth=1').expect(500);
      assert.match(res.text, /Нет доступа к журналу запросов: запрещено прочитать/);
      assert.doesNotMatch(res.text, /EACCES|EPERM|permission denied/i);
    } finally {
      allowRead(LOG_FILE);
    }
  });

});

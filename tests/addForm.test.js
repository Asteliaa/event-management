/**
 * Форма добавления POST /add: серверная проверка всех полей
 * и попытки «сломать» приложение некорректными данными.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { daysFromNow, validForm, encode } = require('./helpers');
const request = require('supertest');
const app = require('../app');
const store = require('../data/events');

beforeEach(() => store.reset());

const post = (body, { type = 'form' } = {}) =>
  request(app).post('/add?auth=1').type(type).send(typeof body === 'string' ? body : encode(body));

/** Ожидает 400, ошибку в указанном поле и отсутствие новой записи. */
async function expectFieldError(body, field, pattern) {
  const before = store.count();
  const res = await post(body).expect(400);
  assert.match(res.text, new RegExp(`id="${field}-error">[^<]*${pattern ? pattern.source : ''}`));
  assert.equal(store.count(), before, 'запись не должна добавиться');
  return res;
}

describe('Успешное добавление', () => {
  test('корректная форма → 303 на главную, запись в списке и на детальной', async () => {
    const res = await post(validForm()).expect(303);
    assert.match(res.headers.location, /^\/\?auth=1&created=5$/);
    const list = await request(app).get(res.headers.location).expect(200);
    assert.match(list.text, /Мероприятие «Митап по Node.js» добавлено/);
    const item = await request(app).get('/item/5').expect(200);
    assert.match(item.text, /Сообщество Node.js/);
  });

  test('пробелы по краям обрезаются', async () => {
    await post(validForm({ title: '   Митап   ', capacity: ' 12 ' })).expect(303);
    const e = store.findById(5);
    assert.equal(e.title, 'Митап');
    assert.equal(e.capacity, 12);
  });

  test('граничные значения: 1 и 120 символов, 1 и 10000 мест, описание 1000', async () => {
    await post(validForm({ title: 'a', capacity: '1' })).expect(303);
    await post(validForm({ title: 'я'.repeat(120), capacity: '10000', description: 'д'.repeat(1000) })).expect(303);
  });

  test('описание необязательно; многострочное описание сохраняется', async () => {
    await post(validForm({ description: '' })).expect(303);
    await post(validForm({ title: 'Другое', description: 'строка 1\r\nстрока 2' })).expect(303);
    assert.equal(store.findById(6).description, 'строка 1\nстрока 2');
  });

  test('лишние поля (id, createdAt, role) игнорируются', async () => {
    await post({ ...validForm(), id: '999', createdAt: 'x', role: 'admin' }).expect(303);
    const e = store.findById(5);
    assert.ok(e);
    assert.equal(store.findById(999), undefined);
    assert.equal(e.role, undefined);
    assert.ok(e.createdAt instanceof Date);
  });

  test('HTML в полях сохраняется как текст и экранируется при выводе', async () => {
    const xss = '<script>alert("x")</script><img src=x onerror=alert(1)>';
    await post(validForm({ title: xss, description: xss })).expect(303);
    for (const url of ['/', '/item/5']) {
      const res = await request(app).get(url).expect(200);
      assert.doesNotMatch(res.text, /<script>alert/);
      assert.doesNotMatch(res.text, /<img src=x/);
      assert.match(res.text, /&lt;script&gt;/);
    }
  });

  test('эмодзи и кириллица считаются по символам', async () => {
    await post(validForm({ title: '🎉'.repeat(120) })).expect(303);
  });
});

describe('Пустые и обязательные поля', () => {
  test('одинаковая форма дважды добавляет две записи (проверка дублей не требуется)', async () => {
    await post(validForm()).expect(303);
    await post(validForm()).expect(303);
    assert.equal(store.count(), 6);
  });

  test('пустая форма → 400 и ошибки во всех обязательных полях', async () => {
    const res = await post('').expect(400);
    for (const f of ['title', 'type', 'format', 'date', 'time', 'location', 'organizer', 'capacity']) {
      assert.match(res.text, new RegExp(`id="${f}-error"`), f);
    }
    assert.doesNotMatch(res.text, /id="description-error"/);
  });

  for (const field of ['title', 'location', 'organizer']) {
    test(`${field}: только пробелы → ошибка`, () => expectFieldError(validForm({ [field]: '    ' }), field, /Заполните/));
    test(`${field}: поле отсутствует → ошибка`, () => expectFieldError(validForm({ [field]: undefined }), field));
  }

  test('введенные данные сохраняются в форме после ошибки (и экранируются)', async () => {
    const res = await expectFieldError(validForm({ capacity: 'abc', title: 'Мой "митап" <b>' }), 'capacity');
    assert.match(res.text, /value="Мой &#34;митап&#34; &lt;b&gt;"/);
    assert.match(res.text, /value="Сообщество Node.js"/);
    assert.match(res.text, /<option value="meetup" selected>/);
  });
});

describe('Текстовые поля', () => {
  test('название длиннее 120 символов', () => expectFieldError(validForm({ title: 'a'.repeat(121) }), 'title', /не длиннее/));
  test('очень длинное название (10 000)', () => expectFieldError(validForm({ title: 'a'.repeat(10000) }), 'title', /не длиннее/));
  test('пробелы, табуляция и переводы строк вместо названия', () => expectFieldError(validForm({ title: ' \t\n\r\n ' }), 'title', /Заполните/));
  test('невидимые символы нулевой ширины вместо названия', () => expectFieldError(validForm({ title: '\u200b\u200b\ufeff' }), 'title', /Заполните/));
  test('неразрывные пробелы вместо названия', () => expectFieldError(validForm({ title: '\u00a0\u2003\u3000' }), 'title', /Заполните/));
  test('после ошибки длины в форму возвращается не больше 120 символов', async () => {
    const res = await expectFieldError(validForm({ title: 'Ж'.repeat(3000) }), 'title', /не длиннее/);
    assert.ok(!res.text.includes('Ж'.repeat(121)));
  });
  test('место длиннее 150', () => expectFieldError(validForm({ location: 'м'.repeat(151) }), 'location'));
  test('организатор длиннее 80', () => expectFieldError(validForm({ organizer: 'Я'.repeat(81) }), 'organizer'));
  test('описание длиннее 1000', () => expectFieldError(validForm({ description: 'д'.repeat(1001) }), 'description', /не длиннее/));
  test('название передано дважды (массив)', () => expectFieldError({ ...validForm(), title: ['a', 'b'] }, 'title', /неверном формате/));
});

describe('Тип и формат', () => {
  for (const type of ['party', 'Conference', '__proto__', 'constructor', 'toString', ' ']) {
    test(`тип "${type}" отклоняется`, () => expectFieldError(validForm({ type }), 'type'));
  }
  test('тип передан массивом', () => expectFieldError({ ...validForm(), type: ['meetup', 'webinar'] }, 'type'));
  for (const format of ['hybrid', 'ONLINE', '__proto__']) {
    test(`формат "${format}" отклоняется`, () => expectFieldError(validForm({ format }), 'format'));
  }
});

describe('Дата и время', () => {
  test('несуществующая дата 31 февраля', () => expectFieldError(validForm({ date: '2027-02-31' }), 'date', /Некорректная/));
  test('29 февраля невисокосного года', () => expectFieldError(validForm({ date: '2027-02-29' }), 'date', /Некорректная/));
  test('месяц 13', () => expectFieldError(validForm({ date: '2027-13-01' }), 'date', /Некорректная/));
  test('день 00', () => expectFieldError(validForm({ date: '2027-01-00' }), 'date', /Некорректная/));
  test('год из 5 цифр', () => expectFieldError(validForm({ date: '20270-01-05' }), 'date', /Некорректная/));
  test('прошедшая дата допустима (проверка не требуется)', async () => {
    await post(validForm({ date: daysFromNow(-1) })).expect(303);
  });
  for (const date of ['abc', '2027-1-5', '05.01.2027', '2027/01/05', '20270105', '2027-01-05T10:00', '+02027-01-05']) {
    test(`формат даты "${date}"`, () => expectFieldError(validForm({ date }), 'date', /Некорректная/));
  }
  for (const time of ['24:00', '12:60', '9:00', '9:5', 'abc', '12:00:00', '-1:00', '']) {
    test(`время "${time}"`, () => expectFieldError(validForm({ time }), 'time'));
  }
});

describe('Количество мест', () => {
  for (const capacity of ['0', '-5', '1.5', '1,5', '1e3', '0x10', '10001', '99999', '99999999999999999999', '9'.repeat(5000), 'abc', '+5', 'NaN', 'Infinity', '５', ' ']) {
    test(`"${capacity}" отклоняется`, () => expectFieldError(validForm({ capacity }), 'capacity'));
  }
  test('огромное число не возвращается в форму целиком', async () => {
    const res = await expectFieldError(validForm({ capacity: '9'.repeat(5000) }), 'capacity');
    assert.ok(!res.text.includes('9'.repeat(6)));
  });
  test('ведущие нули допустимы и приводятся к числу', async () => {
    await post(validForm({ capacity: '007' })).expect(303);
    assert.equal(store.findById(5).capacity, 7);
  });
});

describe('Лимиты и формат запроса', () => {
  test('лимит записей в памяти', async () => {
    while (store.count() < store.MAX_EVENTS) store.add({ ...validForm(), title: 'x' + store.count(), capacity: 1 });
    const res = await post(validForm({ title: 'Еще одно' })).expect(409);
    assert.match(res.text, /лимит/);
  });

  test('JSON вместо формы → 400 с ошибками, без падения', async () => {
    await request(app).post('/add?auth=1').set('Content-Type', 'application/json')
      .send(JSON.stringify(validForm())).expect(400);
  });

  test('битый JSON → 400', async () => {
    await request(app).post('/add?auth=1').set('Content-Type', 'application/json').send('{"title":').expect(400);
  });

  test('text/plain → 400', async () => {
    await request(app).post('/add?auth=1').set('Content-Type', 'text/plain').send('hello').expect(400);
  });

  test('битая URL-кодировка тела не роняет сервер', async () => {
    const res = await post('title=%E0%A4%A&type=%%%');
    assert.ok([400, 303].includes(res.status), `статус ${res.status}`);
  });

  test('слишком большое тело (25 КБ) → 413', async () => {
    const res = await post('description=' + 'a'.repeat(25 * 1024)).expect(413);
    assert.match(res.text, /Слишком большой/);
  });

  test('слишком много полей → 413', async () => {
    const body = Array.from({ length: 40 }, (_, i) => `f${i}=1`).join('&');
    const res = await post(body).expect(413);
    assert.match(res.text, /Слишком много полей/);
  });

  test('неподдерживаемая кодировка → 415', async () => {
    await request(app).post('/add?auth=1').set('Content-Type', 'application/x-www-form-urlencoded; charset=koi8-r')
      .send('title=x').expect(415);
  });

  test('поля вида title[x]=1 не превращаются в объект', () =>
    expectFieldError(encode({ ...validForm(), title: undefined }) + '&title[x]=1', 'title'));
});

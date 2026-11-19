/**
 * Хранилище мероприятий в PostgreSQL (таблица events).
 *
 * Таблица создается автоматически при первом обращении. Если таблица пуста,
 * в нее добавляется начальный набор мероприятий. Если таблицу удалили
 * во время работы, при следующем запросе она создается заново.
 *
 * Все функции асинхронные: ошибки базы данных приходят как DbError
 * и попадают в обработчик ошибок через asyncHandler.
 */
const db = require('./db');

// Максимальное число записей: защита от переполнения базы
// при многократной отправке формы.
const MAX_EVENTS = 500;

const seed = [
  {
    title: 'Конференция «Веб-технологии 2026»',
    type: 'conference',
    format: 'offline',
    date: '2026-12-12',
    time: '10:00',
    location: 'Минск, ул. П. Бровки, 6, актовый зал',
    capacity: 250,
    organizer: 'Кафедра ИТАС',
    description: 'Доклады о современных фреймворках, архитектуре веб-приложений и опыте внедрения.\nПерерыв на кофе в 12:30.'
  },
  {
    title: 'Вебинар: Middleware в Express.js',
    type: 'webinar',
    format: 'online',
    date: '2026-12-03',
    time: '18:30',
    location: 'Онлайн-трансляция',
    capacity: 500,
    organizer: 'EventHub',
    description: 'Разбор цепочки обработки запроса, обработчиков ошибок и порядка подключения middleware.'
  },
  {
    title: 'Встреча выпускников ФИТУ',
    type: 'meetup',
    format: 'offline',
    date: '2027-01-20',
    time: '19:00',
    location: 'Минск, коворкинг «Точка»',
    capacity: 40,
    organizer: 'Студенческий совет',
    description: 'Неформальная встреча: истории о первой работе и знакомство с выпускниками прошлых лет.'
  },
  {
    title: 'Вебинар: Шаблонизатор EJS на практике',
    type: 'webinar',
    format: 'online',
    date: '2026-12-17',
    time: '17:00',
    location: 'Онлайн-трансляция',
    capacity: 300,
    organizer: 'EventHub',
    description: 'Partials, циклы, условия и передача данных из контроллера в шаблон.'
  }
];

// Ограничения длины продублированы в базе: даже при обходе формы
// в таблицу не попадет слишком длинное значение.
const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS events (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(120)  NOT NULL CHECK (btrim(title) <> ''),
    type        VARCHAR(20)   NOT NULL CHECK (type IN ('conference', 'webinar', 'meetup')),
    format      VARCHAR(20)   NOT NULL CHECK (format IN ('offline', 'online')),
    date        DATE          NOT NULL,
    time        TIME          NOT NULL,
    location    VARCHAR(150)  NOT NULL CHECK (btrim(location) <> ''),
    capacity    INTEGER       NOT NULL CHECK (capacity BETWEEN 1 AND 10000),
    organizer   VARCHAR(80)   NOT NULL CHECK (btrim(organizer) <> ''),
    description VARCHAR(1000) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
  )`;

// Столбцы в формате, удобном для шаблонов: дата 'YYYY-MM-DD', время 'HH:MM'
const COLUMNS = `id, title, type, format,
  to_char(date, 'YYYY-MM-DD') AS date, to_char(time, 'HH24:MI') AS time,
  location, capacity, organizer, description, created_at AS "createdAt"`;

const INSERT = `INSERT INTO events (title, type, format, date, time, location, capacity, organizer, description)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${COLUMNS}`;

const values = (e) => [e.title, e.type, e.format, e.date, e.time, e.location, e.capacity, e.organizer, e.description || ''];

const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,40}$/;

// Промис готовности таблицы. Сбрасывается при ошибке, чтобы следующий
// запрос снова попытался подключиться (например, после запуска остановленной базы).
let ready = null;

function ensureReady() {
  if (!ready) {
    ready = db.transaction(async (client) => {
      // Блокировка: несколько одновременных первых запросов не создают таблицу и данные дважды
      await client.query('SELECT pg_advisory_xact_lock(2101)');
      const schema = process.env.DB_SCHEMA;
      if (schema && SCHEMA_RE.test(schema)) await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await client.query(CREATE_TABLE);
      const { rows } = await client.query('SELECT count(*)::int AS n FROM events');
      if (rows[0].n === 0) {
        for (const e of seed) await client.query(INSERT, values(e));
      }
    }).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

/** Выполняет запрос; если таблицу удалили (42P01), создает ее и повторяет один раз. */
async function run(text, params) {
  await ensureReady();
  try {
    return await db.query(text, params);
  } catch (err) {
    if (err.code !== '42P01') throw err;
    ready = null;
    await ensureReady();
    return db.query(text, params);
  }
}

/** Экранирует % и _ для поиска через ILIKE. */
const likePattern = (s) => '%' + s.replace(/[\\%_]/g, (c) => '\\' + c) + '%';

/** Список с фильтром по типу и поиском по названию, месту и организатору. */
async function list({ type = '', q = '' } = {}) {
  const where = [];
  const params = [];
  if (type) {
    params.push(type);
    where.push(`type = $${params.length}`);
  }
  if (q) {
    params.push(likePattern(q));
    const p = `$${params.length}`;
    where.push(`(title ILIKE ${p} OR location ILIKE ${p} OR organizer ILIKE ${p})`);
  }
  const sql = `SELECT ${COLUMNS} FROM events
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY events.date, events.time, id`;
  const { rows } = await run(sql, params);
  return rows;
}

async function findById(id) {
  const { rows } = await run(`SELECT ${COLUMNS} FROM events WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function count() {
  const { rows } = await run('SELECT count(*)::int AS n FROM events');
  return rows[0].n;
}

/**
 * Добавляет мероприятие. Возвращает запись или null, если достигнут лимит.
 * Проверка лимита и вставка – в одной транзакции под блокировкой,
 * поэтому одновременные отправки формы не превысят MAX_EVENTS.
 */
async function add(data) {
  await ensureReady();
  return db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(2102)');
    const { rows } = await client.query('SELECT count(*)::int AS n FROM events');
    if (rows[0].n >= MAX_EVENTS) return null;
    const res = await client.query(INSERT, values(data));
    return res.rows[0];
  });
}

/** Очищает таблицу и возвращает начальный набор (используется в тестах). */
async function reset() {
  await ensureReady();
  await db.transaction(async (client) => {
    await client.query('TRUNCATE events RESTART IDENTITY');
    for (const e of seed) await client.query(INSERT, values(e));
  });
}

/** Подготовка таблицы при запуске сервера. */
const init = ensureReady;

module.exports = { MAX_EVENTS, list, findById, count, add, reset, init };

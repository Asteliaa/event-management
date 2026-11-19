/**
 * Подключение к PostgreSQL (пакет pg, пул соединений).
 *
 * Параметры подключения берутся из переменной окружения DATABASE_URL
 * (файл .env, образец – .env.example).
 *
 * Любая ошибка базы данных превращается в DbError: status 500,
 * понятное пользователю сообщение (userMessage) и исходная ошибка (cause)
 * для консоли сервера. Системный текст пользователю не показывается.
 */
const { Pool } = require('pg');

const DEFAULT_URL = 'postgres://postgres:postgres@localhost:5432/eventhub_pz1';

/** Пользовательская ошибка базы данных. */
class DbError extends Error {
  constructor(userMessage, cause) {
    super(userMessage);
    this.name = 'DbError';
    this.status = 500;
    this.userMessage = userMessage;
    this.code = cause && cause.code;
    this.cause = cause;
  }
}

// Коды ошибок, при которых база недоступна (остановлена, перезапускается, нет сети)
const UNAVAILABLE = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE',
  '57P01', // admin_shutdown – сервер БД остановлен
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now – сервер БД запускается или останавливается
  '08000', '08001', '08003', '08004', '08006' // ошибки соединения
]);

/** Переводит ошибку pg в сообщение для пользователя. */
function toDbError(err) {
  if (err instanceof DbError) return err;
  const code = err && err.code;
  let message;
  if (UNAVAILABLE.has(code) || /timeout|terminat|Connection ended/i.test(String(err && err.message))) {
    message = 'Нет соединения с базой данных: сервер PostgreSQL остановлен или недоступен. Попробуйте позже.';
  } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    message = 'Не найден сервер базы данных, указанный в настройках приложения.';
  } else if (code === '28P01' || code === '28000') {
    message = 'Приложение не может войти в базу данных: неверные имя пользователя или пароль в настройках.';
  } else if (code === '3D000') {
    message = 'База данных, указанная в настройках приложения, не существует.';
  } else if (code === '42501') {
    message = 'Нет прав доступа к таблице мероприятий в базе данных.';
  } else if (code === '53300') {
    message = 'База данных перегружена: слишком много подключений. Попробуйте позже.';
  } else if (code === '53100') {
    message = 'На сервере базы данных закончилось место на диске.';
  } else {
    message = 'Ошибка при работе с базой данных.';
  }
  return new DbError(message, err);
}

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || DEFAULT_URL,
      max: 10,
      // Остановленная база не должна «подвешивать» страницу
      connectionTimeoutMillis: 3000,
      query_timeout: 5000,
      idleTimeoutMillis: 10000,
      // Имя приложения видно в pgAdmin (pg_stat_activity)
      application_name: process.env.DB_SCHEMA ? `eventhub_pz1_${process.env.DB_SCHEMA}` : 'eventhub_pz1',
      options: process.env.DB_SCHEMA ? `-c search_path=${process.env.DB_SCHEMA}` : undefined
    });
    // Обрыв простаивающего соединения (например, базу остановили) иначе
    // завершил бы процесс Node.js необработанным событием 'error'
    pool.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error(`[БД] соединение разорвано: ${err.code || ''} ${err.message}`);
      }
    });
  }
  return pool;
}

/** Выполняет SQL-запрос с параметрами ($1, $2, ...). */
async function query(text, params) {
  try {
    return await getPool().query(text, params);
  } catch (err) {
    throw toDbError(err);
  }
}

/** Выполняет fn(client) в транзакции. */
async function transaction(fn) {
  let client;
  try {
    client = await getPool().connect();
  } catch (err) {
    throw toDbError(err);
  }
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw toDbError(err);
  } finally {
    client.release();
  }
}

/** Закрывает пул (при остановке сервера и в тестах). */
async function close() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

module.exports = { query, transaction, close, DbError, toDbError };

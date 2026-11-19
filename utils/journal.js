/**
 * Журнал запросов в файле logs/requests.log.
 *
 * Файл и папка создаются автоматически: если файл удалили или переименовали,
 * при следующем запросе появится новый. Если восстановить журнал нельзя
 * (вместо файла создана папка, нет прав доступа), выбрасывается
 * JournalError с понятным пользователю сообщением вместо системного текста.
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR
  ? path.resolve(process.env.LOG_DIR)
  : path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'requests.log');
// Пути для сообщений пользователю – относительно проекта, без полного пути на диске
const SHOWN_DIR = path.basename(LOG_DIR);
const SHOWN_FILE = `${SHOWN_DIR}/requests.log`;

// Сколько последних байт файла читать для страницы журнала
const TAIL_BYTES = 64 * 1024;

/** Пользовательская ошибка журнала: status 500, понятный текст и системный код для консоли. */
class JournalError extends Error {
  constructor(userMessage, cause) {
    super(userMessage);
    this.name = 'JournalError';
    this.status = 500;
    this.userMessage = userMessage;
    this.code = cause && cause.code;
    this.cause = cause;
  }
}

/** Переводит системную ошибку файловой системы в сообщение для пользователя. */
function toJournalError(err, action) {
  const what = action === 'read' ? 'прочитать' : 'записать';
  const messages = {
    EISDIR: `Не удалось ${what} журнал запросов: по пути «${SHOWN_FILE}» находится папка, а не файл журнала.`,
    ENOTDIR: `Не удалось ${what} журнал запросов: «${SHOWN_DIR}» должна быть папкой, а на ее месте находится файл.`,
    EEXIST: `Не удалось ${what} журнал запросов: «${SHOWN_DIR}» должна быть папкой, а на ее месте находится файл.`,
    EACCES: `Нет доступа к журналу запросов: запрещено ${what} файл «${SHOWN_FILE}» или папку «${SHOWN_DIR}».`,
    EPERM: `Нет доступа к журналу запросов: запрещено ${what} файл «${SHOWN_FILE}» или папку «${SHOWN_DIR}».`,
    EBUSY: `Журнал запросов «${SHOWN_FILE}» занят другой программой.`,
    ENOSPC: 'Не удалось записать журнал запросов: на диске закончилось место.',
    EROFS: 'Не удалось записать журнал запросов: диск доступен только для чтения.'
  };
  return new JournalError(messages[err.code] || `Не удалось ${what} журнал запросов «${SHOWN_FILE}».`, err);
}

/** Дописывает строку в журнал. При необходимости заново создает папку и файл. */
function append(line) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (err) {
    throw toJournalError(err, 'write');
  }
}

/**
 * Возвращает последние строки журнала (не больше limit).
 * Если файла еще нет – пустой список, это не ошибка.
 */
async function readTail(limit = 100) {
  let handle;
  try {
    handle = await fs.promises.open(LOG_FILE, 'r');
    const { size } = await handle.stat();
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    let lines = buffer.toString('utf8').split('\n').filter(Boolean);
    // Первая строка могла обрезаться посередине – отбрасываем ее
    if (size > TAIL_BYTES) lines = lines.slice(1);
    return lines.slice(-limit).reverse();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw toJournalError(err, 'read');
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

module.exports = { append, readTail, JournalError, LOG_DIR, LOG_FILE, SHOWN_FILE };

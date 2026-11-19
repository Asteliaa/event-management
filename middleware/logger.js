/**
 * Логирующее middleware.
 * 1) При поступлении запроса записывает в файл logs/requests.log
 *    время, метод и URL. Если записать нельзя, передает в next()
 *    пользовательскую ошибку JournalError – ее покажет страница 500.
 * 2) После отправки ответа выводит в консоль метод, URL, время,
 *    код ответа и длительность обработки.
 */
const journal = require('../utils/journal');

const SILENT = process.env.NODE_ENV === 'test';
const MAX_URL = 200;

// Убираем управляющие символы и ограничиваем длину, чтобы через URL
// нельзя было подделать строки журнала или засорить файл огромным адресом.
function safeUrl(url) {
  const clean = String(url).replace(/[\u0000-\u001F\u007F]/g, '?');
  return clean.length > MAX_URL ? `${clean.slice(0, MAX_URL)}…` : clean;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function requestLogger(req, res, next) {
  const startedAt = new Date();
  const start = process.hrtime.bigint();
  const url = safeUrl(req.originalUrl);

  res.on('finish', () => {
    if (SILENT) return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`[${stamp(startedAt)}] ${req.method} ${url} → ${res.statusCode} (${ms.toFixed(1)} мс)`);
  });

  try {
    journal.append(`${stamp(startedAt)} ${req.method} ${url}`);
  } catch (err) {
    return next(err);
  }
  next();
}

module.exports = requestLogger;

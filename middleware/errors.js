/**
 * Обработка ошибок.
 * notFound      – 404 для всех необработанных адресов (подключается после маршрутов);
 * methodNotAllowed – 405 для известного адреса с неподдерживаемым методом;
 * errorHandler  – middleware с четырьмя параметрами (err, req, res, next),
 *                 ловит все ошибки приложения: 4xx показывает как ошибку запроса,
 *                 остальное – как 500 с записью в журнал.
 */
const crypto = require('crypto');
const path = require('path');

function notFound(req, res) {
  res.status(404).render('404', {
    title: 'Страница не найдена',
    url: req.originalUrl,
    message: null
  });
}

function methodNotAllowed(allowed) {
  return (req, res) => {
    res.set('Allow', allowed);
    res.status(405).render('error', {
      title: 'Метод не поддерживается',
      status: 405,
      message: `Метод ${req.method} для этого адреса не поддерживается. Допустимо: ${allowed}.`
    });
  };
}

// Понятные сообщения для типовых ошибок разбора запроса (body-parser, URL)
const CLIENT_MESSAGES = {
  'entity.too.large': 'Слишком большой объем данных в запросе.',
  'parameters.too.many': 'Слишком много полей в запросе.',
  'encoding.unsupported': 'Неподдерживаемая кодировка запроса.',
  'charset.unsupported': 'Неподдерживаемая кодировка запроса.',
  'request.aborted': 'Запрос был прерван.'
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Если ответ уже начал отправляться, передаем ошибку стандартному обработчику Express
  if (res.headersSent) return next(err);

  const status = Number(err.status || err.statusCode) || 500;

  if (status >= 400 && status < 500) {
    return res.status(status).render('error', {
      title: 'Некорректный запрос',
      status,
      message: CLIENT_MESSAGES[err.type] || 'Сервер не смог разобрать запрос. Проверьте адрес и данные.'
    });
  }

  // 500: системные подробности – только в консоль сервера,
  // пользователю – понятное сообщение и код инцидента
  const incident = crypto.randomBytes(4).toString('hex');
  if (process.env.NODE_ENV !== 'test') {
    // Системная причина: код ошибки и операция, путь – относительно папки проекта
    const c = err.cause;
    let system;
    if (c && c.syscall && c.address) {
      // Сетевая ошибка подключения к базе данных
      system = `${c.code} (${c.syscall} ${c.address}:${c.port})`;
    } else if (c && c.syscall) {
      // Ошибка файловой системы (журнал)
      system = `${c.code} (${c.syscall} ${path.relative(process.cwd(), c.path || '') || '.'})`;
    } else if (c) {
      // Ошибка базы данных: код PostgreSQL или сетевой код и текст драйвера
      system = `${c.code || c.name || 'ERROR'} ${c.message}`;
    } else {
      system = err.stack || String(err);
    }
    console.error(`[ОШИБКА ${incident}] ${req.method} ${req.originalUrl}: ${err.message}\n  причина: ${system}`);
  }
  res.status(500).render('500', {
    title: 'Ошибка сервера',
    incident,
    // Текст показываем только для своих (пользовательских) ошибок, системный – никогда
    message: err.userMessage || null
  });
}

module.exports = { notFound, methodNotAllowed, errorHandler };

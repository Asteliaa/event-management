/**
 * Обертка для асинхронных обработчиков в Express 4:
 * отклоненный промис передается в next(err) без try/catch в каждом маршруте.
 */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

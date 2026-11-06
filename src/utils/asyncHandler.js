// Обертка для асинхронных контроллеров Express 4: отклоненный промис передается в next(err),
// поэтому в контроллерах не нужен try/catch
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

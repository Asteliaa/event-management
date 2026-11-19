/**
 * Имитация авторизации по query-параметру ?auth=1.
 *
 * simulateAuth – подключается глобально: если auth=1, пользователь –
 *   «Организатор», иначе req.user = { name: 'Гость' }.
 * requireAuth – подключается к отдельным маршрутам (/add):
 *   гостя перенаправляет на страницу входа /login.
 */

function simulateAuth(req, res, next) {
  // Строгая проверка: только строка '1'. Массив (?auth=1&auth=1),
  // объект (?auth[x]=1) и другие значения (?auth=true) не принимаются.
  const authorized = req.query.auth === '1';

  req.user = authorized
    ? { name: 'Организатор', role: 'organizer' }
    : { name: 'Гость', role: 'guest' };

  // Данные для всех шаблонов: текущий пользователь и помощник для ссылок,
  // который сохраняет ?auth=1 при переходах между страницами.
  res.locals.user = req.user;
  res.locals.link = (path) => {
    if (!authorized) return path;
    return path + (path.includes('?') ? '&' : '?') + 'auth=1';
  };
  next();
}

function requireAuth(req, res, next) {
  if (req.user && req.user.role === 'organizer') return next();
  // 303 – чтобы после POST браузер перешел на /login методом GET
  res.redirect(303, '/login?next=' + encodeURIComponent(req.path));
}

/**
 * Безопасный адрес возврата после входа: только локальный путь.
 * Отсекает внешние адреса (//evil.com, http://…) и обратные слэши.
 */
function safeNext(value) {
  if (typeof value !== 'string') return '/';
  return /^\/(?!\/)[A-Za-z0-9\-_/]{0,100}$/.test(value) ? value : '/';
}

module.exports = { simulateAuth, requireAuth, safeNext };

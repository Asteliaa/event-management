/**
 * Настройка Express-приложения: шаблонизатор EJS, middleware, маршруты,
 * обработчики ошибок. Порядок подключения важен:
 *   заголовки → статика → авторизация → логирование → маршруты → 404 → 500.
 * Авторизация стоит раньше логирования: если журнал сломан, страница 500
 * уже знает пользователя и показывает в шапке «Организатор», а не «Гость».
 */
const path = require('path');
const express = require('express');

const securityHeaders = require('./middleware/securityHeaders');
const requestLogger = require('./middleware/logger');
const { simulateAuth } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');
const pagesRouter = require('./routes/pages');
const { formatDate } = require('./utils/dates');
const { EVENT_TYPES, EVENT_FORMATS } = require('./utils/constants');

const app = express();

// Шаблонизатор EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Стандартный заголовок X-Powered-By: Express отключаем (свой ставит securityHeaders)
app.disable('x-powered-by');
// Разбор query-строки без вложенных объектов (?a[b]=1 не превращается в объект)
app.set('query parser', 'simple');

// Хелперы и справочники, доступные во всех шаблонах
app.locals.formatDate = formatDate;
app.locals.EVENT_TYPES = EVENT_TYPES;
app.locals.EVENT_FORMATS = EVENT_FORMATS;
app.locals.siteName = 'EventHub';

// 1. Общие заголовки для всех ответов
app.use(securityHeaders);
// 2. Статика (CSS, JS) – до маршрутов, без лишней обработки
app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '1h' }));
// 3. Имитация авторизации: req.user = Организатор или Гость
app.use(simulateAuth);
// 4. Логирование запросов в файл журнала
app.use(requestLogger);
// 5. Маршруты страниц
app.use('/', pagesRouter);
// 6. 404 – после всех маршрутов
app.use(notFound);
// 7. Обработчик ошибок (4 параметра) – последним
app.use(errorHandler);

module.exports = app;

/**
 * Контроллер мероприятий: получает данные из массива
 * и передает их в EJS-шаблоны через res.render().
 */
const store = require('../data/events');
const { validateEvent } = require('../utils/validateEvent');
const { EVENT_TYPES, EVENT_FORMATS, LIMITS } = require('../utils/constants');
const { todayISO } = require('../utils/dates');
const journal = require('../utils/journal');

const ID_RE = /^[1-9]\d{0,8}$/;

// GET / – список мероприятий с фильтром по типу и поиском
function list(req, res) {
  const notices = [];

  // Фильтр по типу: только значение из справочника
  let type = '';
  if (req.query.type !== undefined && req.query.type !== '') {
    if (typeof req.query.type === 'string' && Object.prototype.hasOwnProperty.call(EVENT_TYPES, req.query.type)) {
      type = req.query.type;
    } else {
      notices.push('Неизвестный тип мероприятия в фильтре – показаны все типы.');
    }
  }

  // Поиск: строка до 100 символов
  let q = '';
  if (req.query.q !== undefined) {
    if (typeof req.query.q !== 'string') {
      notices.push('Некорректный поисковый запрос – поиск не применен.');
    } else {
      q = req.query.q.trim();
      if ([...q].length > LIMITS.search.max) {
        q = [...q].slice(0, LIMITS.search.max).join('');
        notices.push(`Поисковый запрос сокращен до ${LIMITS.search.max} символов.`);
      }
    }
  }

  const needle = q.toLocaleLowerCase('ru-RU');
  const events = store.getAll()
    .filter((e) => !type || e.type === type)
    .filter((e) => !needle || [e.title, e.location, e.organizer]
      .some((field) => field.toLocaleLowerCase('ru-RU').includes(needle)))
    .slice()
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.id - b.id);

  // Сообщение об успешном добавлении после редиректа (?created=ID)
  let created = null;
  if (typeof req.query.created === 'string' && ID_RE.test(req.query.created)) {
    created = store.findById(Number(req.query.created)) || null;
  }

  res.render('index', {
    title: 'Мероприятия',
    events,
    total: store.count(),
    filters: { type, q },
    notices,
    created,
    today: todayISO()
  });
}

// GET /item/:id – детальная страница
function detail(req, res) {
  const { id } = req.params;
  // Нечисловой, отрицательный, дробный или слишком длинный id – сразу 404,
  // в массив с таким значением не обращаемся
  const event = ID_RE.test(id) ? store.findById(Number(id)) : null;
  if (!event) {
    return res.status(404).render('404', {
      title: 'Мероприятие не найдено',
      url: req.originalUrl,
      message: 'Мероприятия с таким номером нет. Записи, добавленные до перезапуска сервера, не сохраняются.'
    });
  }
  res.render('item', { title: event.title, event, today: todayISO() });
}

// Общие данные для формы добавления
function renderForm(res, status, values, errors, formError) {
  res.status(status).render('add', {
    title: 'Новое мероприятие',
    values,
    errors,
    formError: formError || null,
    types: EVENT_TYPES,
    formats: EVENT_FORMATS,
    limits: LIMITS,
    today: todayISO()
  });
}

// GET /add – пустая форма
function showForm(req, res) {
  renderForm(res, 200, { type: '', format: '' }, {});
}

// POST /add – проверка, сохранение в массив и редирект на главную
function create(req, res) {
  const { data, errors } = validateEvent(req.body);

  if (Object.keys(errors).length) {
    return renderForm(res, 400, data, errors, 'Исправьте ошибки в отмеченных полях.');
  }

  if (store.count() >= store.MAX_EVENTS) {
    return renderForm(res, 409, data, {}, `Достигнут лимит в ${store.MAX_EVENTS} мероприятий.`);
  }

  const event = store.add(data);
  // 303 See Other: шаблон Post/Redirect/Get, обновление страницы не отправит форму повторно
  res.redirect(303, `/?auth=1&created=${event.id}`);
}

// GET /logs – последние записи журнала запросов (чтение файла).
// Асинхронная функция: ошибка чтения попадает в обработчик ошибок через asyncHandler.
async function logs(req, res) {
  const lines = await journal.readTail(100);
  res.render('logs', { title: 'Журнал запросов', lines, file: journal.SHOWN_FILE });
}

module.exports = { list, detail, showForm, create, logs };

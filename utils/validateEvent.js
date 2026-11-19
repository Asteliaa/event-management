/**
 * Серверная проверка формы добавления мероприятия.
 * Браузерные ограничения (required, maxlength) легко обойти,
 * поэтому сервер повторяет основные проверки:
 *   – поле не пустое и не состоит из одних пробелов;
 *   – длина не больше допустимой (защита от вставки огромного текста);
 *   – значения списков и формат даты, времени и числа мест корректны.
 *
 * Возвращает { data, errors }:
 *   data   – очищенные значения (для сохранения или повторного вывода формы);
 *   errors – объект «поле → сообщение», пустой, если ошибок нет.
 */
const { EVENT_TYPES, EVENT_FORMATS, LIMITS } = require('./constants');

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const INT_RE = /^\d+$/;

/**
 * Приводит значение к строке без пробелов по краям.
 * Если поле передано несколько раз (title=a&title=b), Express отдает массив –
 * такое значение считается некорректным.
 */
function asString(value) {
  if (value === undefined || value === null) return { value: '' };
  if (typeof value !== 'string') return { value: '', invalid: true };
  // Невидимые символы нулевой ширины считаются пробельными, как и обычные пробелы
  return { value: value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, ' ').replace(/\r\n?/g, '\n').trim() };
}

/** Длина в символах Unicode (эмодзи считается одним символом). */
const length = (s) => [...s].length;

/** Текстовое поле: не пустое (если обязательно) и не длиннее max. */
function checkText(raw, { required, max }, label) {
  const { value, invalid } = asString(raw);
  if (invalid) return { value, error: `Поле «${label}» передано в неверном формате` };
  if (!value) return { value, error: required ? `Заполните поле «${label}»` : null };
  if (length(value) > max) {
    return { value: [...value].slice(0, max).join(''), error: `Поле «${label}»: не длиннее ${max} символов` };
  }
  return { value, error: null };
}

/** Строка YYYY-MM-DD – реально существующая дата (31.02 отклоняется). */
function isRealDate(value) {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Значение из справочника (select). */
function checkChoice(raw, dictionary, message) {
  const { value } = asString(raw);
  const ok = Object.prototype.hasOwnProperty.call(dictionary, value);
  return { value: ok ? value : '', error: ok ? null : message };
}

/** Короткое поле с форматом (дата, время, число): пустота, длина, шаблон. */
function checkFormatted(raw, { maxLength, test }, emptyMessage, badMessage) {
  const { value, invalid } = asString(raw);
  if (!value && !invalid) return { value, error: emptyMessage };
  if (invalid || value.length > maxLength || !test(value)) {
    return { value: value.slice(0, maxLength), error: badMessage };
  }
  return { value, error: null };
}

function validateEvent(body) {
  const src = body && typeof body === 'object' ? body : {};
  const data = {};
  const errors = {};
  const put = (name, res) => {
    data[name] = res.value;
    if (res.error) errors[name] = res.error;
  };

  put('title', checkText(src.title, { required: true, max: LIMITS.title.max }, 'Название'));
  put('type', checkChoice(src.type, EVENT_TYPES, 'Выберите тип мероприятия из списка'));
  put('format', checkChoice(src.format, EVENT_FORMATS, 'Выберите формат проведения из списка'));
  put('date', checkFormatted(src.date, { maxLength: 10, test: isRealDate },
    'Укажите дату проведения', 'Некорректная дата'));
  put('time', checkFormatted(src.time, { maxLength: 5, test: (v) => TIME_RE.test(v) },
    'Укажите время начала', 'Время в формате ЧЧ:ММ'));
  put('location', checkText(src.location, { required: true, max: LIMITS.location.max }, 'Место проведения'));
  put('organizer', checkText(src.organizer, { required: true, max: LIMITS.organizer.max }, 'Организатор'));

  const { min, max, maxLength } = LIMITS.capacity;
  const capacity = checkFormatted(src.capacity, {
    maxLength,
    test: (v) => INT_RE.test(v) && Number(v) >= min && Number(v) <= max
  }, 'Укажите количество мест', `Количество мест – целое число от ${min} до ${max}`);
  if (!capacity.error) capacity.value = Number(capacity.value);
  put('capacity', capacity);

  put('description', checkText(src.description, { required: false, max: LIMITS.description.max }, 'Описание'));

  return { data, errors };
}

module.exports = { validateEvent, isRealDate };

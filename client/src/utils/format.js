// Форматирование дат, чисел и подписей для интерфейса

export const TYPE_LABELS = { conference: 'Конференция', webinar: 'Вебинар', meeting: 'Встреча' };
export const STATUS_LABELS = { registered: 'Зарегистрирован', cancelled: 'Отменена' };
export const ATTENDED_LABEL = 'Посетил';

// Форматтеры кэшируются по набору опций и часовому поясу. Без пояса – локальное время браузера;
// с поясом мероприятия (IANA, например Europe/Minsk) – время по месту проведения
const cache = new Map();
const fmt = (options, timeZone) => {
  const key = JSON.stringify([options, timeZone || null]);
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat('ru-RU', { ...options, ...(timeZone && { timeZone }) }));
  return cache.get(key);
};
const DATE = { day: 'numeric', month: 'long', year: 'numeric' };
const SHORT = { day: 'numeric', month: 'short' };
const TIME = { hour: '2-digit', minute: '2-digit' };

export const formatDate = (d, tz) => fmt(DATE, tz).format(new Date(d));
export const formatShort = (d, tz) => fmt(SHORT, tz).format(new Date(d));
export const formatTime = (d, tz) => fmt(TIME, tz).format(new Date(d));
export const formatWeekday = (d, tz) => fmt({ weekday: 'short' }, tz).format(new Date(d));
export const formatMonth = (d, tz) => fmt({ month: 'short' }, tz).format(new Date(d));
export const formatDay = (d, tz) => fmt({ day: 'numeric' }, tz).format(new Date(d));
export const formatDateTime = (d, tz) => `${formatDate(d, tz)}, ${formatTime(d, tz)}`;

// Пояс браузера пользователя (для формы мероприятия и подсказки «по вашему времени»)
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Совпадает ли смещение пояса мероприятия с поясом пользователя в момент d
export function sameOffset(d, tz) {
  const t = new Date(d);
  const parts = (zone) => fmt({ hour: 'numeric', minute: 'numeric', day: 'numeric', hourCycle: 'h23' }, zone).format(t);
  return parts(tz) === parts(undefined);
}

export const EVENT_STATUS_LABELS = { draft: 'Черновик', published: 'Опубликовано', cancelled: 'Отменено' };
export const PHASE_LABELS = { upcoming: 'Скоро', live: 'Идет сейчас', finished: 'Завершено' };

// 1 место, 2 места, 5 мест
export function plural(n, [one, few, many]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// «через 3 дня», «через 5 часов», «прошло»
export function timeUntil(d) {
  const diff = new Date(d).getTime() - Date.now();
  if (diff <= 0) return 'уже прошло';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `через ${minutes} ${plural(minutes, ['минуту', 'минуты', 'минут'])}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `через ${hours} ${plural(hours, ['час', 'часа', 'часов'])}`;
  const days = Math.round(hours / 24);
  return `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`;
}

// Интервал напоминания: 1440 → «за 1 день», 90 → «за 1 ч 30 мин»
export function formatOffset(minutes) {
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return `за ${d} ${plural(d, ['день', 'дня', 'дней'])}`;
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `за ${h} ч${m ? ` ${m} мин` : ''}`;
  }
  return `за ${minutes} мин`;
}

export const REMINDER_PRESETS = [
  { value: 15, label: 'за 15 минут' },
  { value: 60, label: 'за 1 час' },
  { value: 180, label: 'за 3 часа' },
  { value: 1440, label: 'за 1 день' },
  { value: 4320, label: 'за 3 дня' },
  { value: 10080, label: 'за неделю' },
];

export const placeOf = (event) => (event.location?.online
  ? 'Онлайн'
  : [event.location?.city, event.location?.venue].filter(Boolean).join(', ') || 'Место уточняется');

// Смещение пояса tz относительно UTC (мс) в момент date
function tzOffsetMs(date, tz) {
  const p = Object.fromEntries(fmt({
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  }, tz).formatToParts(date).map(({ type, value }) => [type, value]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// <input type="datetime-local"> показывает время по поясу мероприятия, а не браузера:
// момент → «настенное» время в tz и обратно
export function toZonedInput(d, tz) {
  if (!d) return '';
  const date = new Date(d);
  const local = new Date(date.getTime() + tzOffsetMs(date, tz));
  return local.toISOString().slice(0, 16);
}

// Перевод «настенного» времени пояса в момент с учетом перевода часов.
// Политика (описана в README):
// - обычное время – единственный момент;
// - несуществующее (весной часы переводятся вперед, например 02:30 в Europe/Berlin в последнее
//   воскресенье марта) – status: 'nonexistent', iso: null: форма не сохраняется, пока время не исправят;
// - неоднозначное (осенью час повторяется, например 02:30 в Europe/Berlin в последнее воскресенье октября) –
//   status: 'ambiguous': выбирается первое наступление (по летнему времени), форма показывает подсказку,
//   второй вариант – в alternative.
export function resolveZonedInput(value, tz) {
  if (!value) return { status: 'empty', iso: null };
  const wall = Date.parse(`${value}:00Z`);
  if (Number.isNaN(wall)) return { status: 'invalid', iso: null };
  // смещения пояса за сутки до и через сутки после: у перехода часов они различаются
  const offsets = [...new Set([tzOffsetMs(new Date(wall - 864e5), tz), tzOffsetMs(new Date(wall + 864e5), tz), tzOffsetMs(new Date(wall), tz)])];
  const candidates = [...new Set(offsets.map((o) => wall - o))]
    .filter((ms) => toZonedInput(new Date(ms), tz) === value)
    .sort((a, b) => a - b);
  if (!candidates.length) return { status: 'nonexistent', iso: null };
  const iso = new Date(candidates[0]).toISOString();
  if (candidates.length > 1) return { status: 'ambiguous', iso, alternative: new Date(candidates[1]).toISOString() };
  return { status: 'ok', iso };
}

// Момент для API; несуществующее время – null (форма проверяет его заранее через resolveZonedInput)
export function fromZonedInput(value, tz) {
  return resolveZonedInput(value, tz).iso;
}

// Сообщение формы о времени у перехода часов: { error } – сохранить нельзя, { hint } – подсказка
export function zonedInputIssue(value, tz) {
  const r = resolveZonedInput(value, tz);
  if (r.status === 'nonexistent') return { error: `Такого времени нет в поясе ${tz}: в этот день часы переводятся вперед. Выберите другое время` };
  if (r.status === 'ambiguous') {
    return { hint: `Время повторяется из-за перевода часов назад: выбрано первое (${formatOffsetName(r.iso, tz)}), второе – ${formatOffsetName(r.alternative, tz)}` };
  }
  return {};
}

function formatOffsetName(iso, tz) {
  const part = fmt({ timeZoneName: 'shortOffset' }, tz).formatToParts(new Date(iso)).find((p) => p.type === 'timeZoneName');
  return part ? part.value : tz;
}

// Значение для <input type="datetime-local"> в локальном времени
export function toLocalInput(d) {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Форматирование дат, чисел и подписей для интерфейса

export const TYPE_LABELS = { conference: 'Конференция', webinar: 'Вебинар', meeting: 'Встреча' };
export const STATUS_LABELS = { registered: 'Зарегистрирован', attended: 'Посетил', cancelled: 'Отменена' };

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });

export const formatDate = (d) => dateFmt.format(new Date(d));
export const formatShort = (d) => shortFmt.format(new Date(d));
export const formatTime = (d) => timeFmt.format(new Date(d));
export const formatWeekday = (d) => weekdayFmt.format(new Date(d));
export const formatDateTime = (d) => `${formatDate(d)}, ${formatTime(d)}`;

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

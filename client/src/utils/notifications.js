import { formatDateTime, formatOffset } from './format.js';

// Текст уведомления по типу. payload хранит только идентификаторы и неперсональные значения,
// название мероприятия приходит из связанной записи
export function notificationText(n) {
  const title = n.event ? `«${n.event.title}»` : 'мероприятие';
  const p = n.payload || {};
  switch (n.type) {
    case 'reminder':
      // delayed – напоминание задержано (например, пока учетная запись была деактивирована)
      if (p.delayed) {
        return `Скоро начало: ${title} – ${formatDateTime(p.startsAt, p.timezone)}`
          + ` (напоминание задержано, было запланировано на ${formatDateTime(p.remindAt, p.timezone)})`;
      }
      return `Скоро начало: ${title}${p.offsetMinutes ? ` (напоминание ${formatOffset(p.offsetMinutes)} до начала)` : ''}`;
    case 'event_rescheduled':
      if (p.kind === 'extended') return `${title} продлено до ${formatDateTime(p.endsAt, p.timezone)}`;
      return `${title} перенесено на ${formatDateTime(p.startsAt, p.timezone)}`;
    case 'event_location_changed':
      return p.urlChanged && p.online ? `${title}: изменилась ссылка подключения` : `${title}: изменилось место проведения`;
    case 'event_cancelled':
      return `${title} отменено${p.reason ? `: ${p.reason}` : ''}`;
    case 'registration_cancelled':
      return `Ваша регистрация на ${title} отменена ${p.by === 'admin' ? 'администратором' : 'организатором'}${p.reason ? `: ${p.reason}` : ''}`;
    default:
      return `Уведомление: ${title}`;
  }
}

import { Link } from 'react-router';
import { Clock, MapPin, Video } from 'lucide-react';
import { TYPE_LABELS, formatDay, formatMonth, formatTime, formatWeekday, placeOf } from '../../utils/format.js';

// Дата в виде листка календаря: месяц, число и день недели
// Дата – по поясу мероприятия (tz); у черновика даты может не быть
export function DateBlock({ date, tz, size = 'md' }) {
  if (!date) {
    return (
      <span className={`date-block date-block--${size}`}>
        <span className="date-block__month">дата</span>
        <span className="date-block__day">—</span>
        <span className="date-block__wd">не задана</span>
      </span>
    );
  }
  return (
    <span className={`date-block date-block--${size}`}>
      <span className="date-block__month">{formatMonth(date, tz).replace('.', '')}</span>
      <span className="date-block__day">{formatDay(date, tz)}</span>
      <span className="date-block__wd">{formatWeekday(date, tz)}</span>
    </span>
  );
}

export function SeatsBar({ event }) {
  if (!event.capacity) return <span className="seats seats--free">Без ограничения мест</span>;
  const percent = Math.min(100, Math.round((event.seatsTaken / event.capacity) * 100));
  const left = event.seatsLeft;
  return (
    <span className={`seats ${left === 0 ? 'seats--full' : percent >= 85 ? 'seats--few' : ''}`}>
      <span className="seats__bar"><span style={{ width: `${percent}%` }} /></span>
      <span className="seats__label">
        {left === 0 ? 'Мест нет' : `Свободно ${left} из ${event.capacity}`}
      </span>
    </span>
  );
}

export function CategoryMark({ category }) {
  if (!category) return null;
  return <span className="cat-mark" style={{ '--cat': category.color }}>{category.name}</span>;
}

// Карточка-строка списка мероприятий: дата, формат и тема, название, время и место, свободные места
export default function EventRow({ event, compact = false }) {
  return (
    <Link to={`/events/${event.id}`} className={`event-row ${compact ? 'event-row--compact' : ''} ${event.status === 'cancelled' ? 'is-cancelled' : ''}`}>
      <DateBlock date={event.startsAt} tz={event.timezone} size={compact ? 'sm' : 'md'} />
      <span className="event-row__main">
        <span className="event-row__kicker">
          <span className={`type type--${event.type}`}>{TYPE_LABELS[event.type]}</span>
          <CategoryMark category={event.category} />
          {event.status === 'cancelled' && <span className="flag flag--danger">Отменено</span>}
        </span>
        <span className="event-row__title">{event.title}</span>
        <span className="event-row__place">
          {event.startsAt && <span><Clock size={14} /> {formatTime(event.startsAt, event.timezone)}</span>}
          <span>{event.location?.online ? <Video size={14} /> : <MapPin size={14} />} {placeOf(event)}</span>
        </span>
      </span>
      {!compact && <span className="event-row__side"><SeatsBar event={event} /></span>}
    </Link>
  );
}

export function EventRowSkeleton({ compact = false }) {
  return (
    <div className={`event-row skeleton ${compact ? 'event-row--compact' : ''}`} aria-hidden="true">
      <span className={`date-block date-block--${compact ? 'sm' : 'md'}`} />
      <span className="event-row__main">
        <span className="skeleton__line" style={{ width: '30%' }} />
        <span className="skeleton__line skeleton__line--lg" style={{ width: '70%' }} />
        <span className="skeleton__line" style={{ width: '45%' }} />
      </span>
    </div>
  );
}

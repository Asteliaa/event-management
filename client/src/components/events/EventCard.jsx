import { Link } from 'react-router';
import { Clock, MapPin, Video } from 'lucide-react';
import { TYPE_LABELS, formatTime, placeOf } from '../../utils/format.js';

const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });

// Штамп даты, похожий на корешок билета: число, месяц и (в крупном размере) день недели
export function DateBlock({ date, size = 'md' }) {
  const d = new Date(date);
  return (
    <span className={`date-block date-block--${size}`}>
      <span className="date-block__day">{d.getDate()}</span>
      <span className="date-block__month">{monthFmt.format(d).replace('.', '')}</span>
      <span className="date-block__wd">{weekdayFmt.format(d)}</span>
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

// Обложка афиши: изображение организатора или типографическая обложка из категории и формата
export function PosterCover({ event, className = '', dateSize = 'md' }) {
  return (
    <span className={`poster__cover poster__cover--${event.type} ${className}`} style={{ '--cat': event.category?.color }}>
      {event.coverUrl && <img src={event.coverUrl} alt="" loading="lazy" />}
      <DateBlock date={event.startsAt} size={dateSize} />
      <span className="poster__format">{TYPE_LABELS[event.type]}</span>
      {!event.coverUrl && <span className="poster__word" aria-hidden="true">{event.category?.name || TYPE_LABELS[event.type]}</span>}
    </span>
  );
}

// Афиша мероприятия для каталога и подборок: обложка, тема, название, время, место и свободные места
export default function EventCard({ event, feature = false }) {
  return (
    <Link to={`/events/${event.id}`} className={`poster ${feature ? 'poster--feature' : ''} ${event.status === 'cancelled' ? 'is-cancelled' : ''}`}>
      <PosterCover event={event} dateSize={feature ? 'lg' : 'md'} />
      <span className="poster__body">
        <span className="poster__kicker">
          <CategoryMark category={event.category} />
          {event.status === 'cancelled' && <span className="flag flag--danger">Отменено</span>}
        </span>
        <span className="poster__title">{event.title}</span>
        <span className="poster__meta">
          <span><Clock size={14} /> {formatTime(event.startsAt)}</span>
          <span>{event.location?.online ? <Video size={14} /> : <MapPin size={14} />} <span className="nowrap-ellipsis">{placeOf(event)}</span></span>
        </span>
        <span className="poster__foot"><SeatsBar event={event} /></span>
      </span>
    </Link>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="poster skeleton" aria-hidden="true">
      <span className="poster__cover" />
      <span className="poster__body">
        <span className="skeleton__line" style={{ width: '35%' }} />
        <span className="skeleton__line skeleton__line--lg" style={{ width: '85%' }} />
        <span className="skeleton__line" style={{ width: '50%' }} />
      </span>
    </div>
  );
}

import { Link } from 'react-router';
import { Clock, MapPin, Ticket } from 'lucide-react';
import EventCover from './EventCover.jsx';
import { TYPE_LABELS, formatTime, placeOf, plural } from '../../utils/format.js';

export function SeatsBar({ event }) {
  if (!event.capacity) return <span className="seats seats--free">Мест без ограничений</span>;
  const percent = Math.min(100, Math.round((event.seatsTaken / event.capacity) * 100));
  const left = event.seatsLeft;
  return (
    <div className="seats">
      <div className="seats__bar"><span style={{ width: `${percent}%` }} className={percent >= 90 ? 'is-hot' : ''} /></div>
      <span className="seats__label">
        {left === 0 ? 'Мест нет' : `Осталось ${left} ${plural(left, ['место', 'места', 'мест'])}`}
      </span>
    </div>
  );
}

// Карточка мероприятия в каталоге
export default function EventCard({ event }) {
  return (
    <article className={`card event-card ${event.status === 'cancelled' ? 'is-cancelled' : ''}`}>
      <Link to={`/events/${event.id}`} className="event-card__link" aria-label={event.title}>
        <EventCover event={event} />
      </Link>
      <div className="event-card__body">
        <div className="event-card__tags">
          <span className={`chip chip--${event.type}`}>{TYPE_LABELS[event.type]}</span>
          {event.category && (
            <span className="chip chip--category" style={{ '--chip': event.category.color }}>{event.category.name}</span>
          )}
          {event.status === 'cancelled' && <span className="chip chip--danger">Отменено</span>}
        </div>
        <h3 className="event-card__title"><Link to={`/events/${event.id}`}>{event.title}</Link></h3>
        <ul className="event-card__meta">
          <li><Clock size={15} /> {formatTime(event.startsAt)}</li>
          <li><MapPin size={15} /> {placeOf(event)}</li>
        </ul>
        <div className="event-card__footer">
          <SeatsBar event={event} />
          <Link to={`/events/${event.id}`} className="btn btn--sm btn--soft"><Ticket size={15} /> Подробнее</Link>
        </div>
      </div>
    </article>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="card event-card skeleton" aria-hidden="true">
      <div className="cover cover--card" />
      <div className="event-card__body">
        <span className="skeleton__line" style={{ width: '40%' }} />
        <span className="skeleton__line skeleton__line--lg" />
        <span className="skeleton__line" style={{ width: '70%' }} />
      </div>
    </div>
  );
}

import { memo } from 'react';
import { EVENT_TYPES } from '../data/demoEvents.js';
import { todayISO } from '../utils/events.js';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

// React.memo: строка перерисовывается, только если изменились ее props
function EventItem({ event, isEditing, onEdit, onDelete }) {
  const isPast = event.date < todayISO();
  return (
    <li className={`event-item${isEditing ? ' is-editing' : ''}${isPast ? ' is-past' : ''}`}>
      <div className="event-main">
        <div className="event-meta">
          <span className={`badge badge-${event.type}`}>{EVENT_TYPES[event.type]}</span>
          <time dateTime={event.date}>{dateFormat.format(new Date(`${event.date}T00:00`))}</time>
          {isPast && <span className="badge badge-past">прошло</span>}
        </div>
        <h3>{event.title}</h3>
        {event.description && <p>{event.description}</p>}
      </div>
      <div className="event-side">
        <span className="capacity">{event.capacity} мест</span>
        <div className="event-actions">
          <button type="button" className="btn btn-small" onClick={() => onEdit(event.id)}>Изменить</button>
          <button type="button" className="btn btn-small btn-danger" onClick={() => onDelete(event.id)}>Удалить</button>
        </div>
      </div>
    </li>
  );
}

export default memo(EventItem);

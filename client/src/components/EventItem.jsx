import { EVENT_TYPES } from '../data/eventTypes.js';

function EventItem({ event, isAdmin, onEdit, onDelete }) {
  return (
    <tr className={event.pending ? 'pending' : ''}>
      <td>{event.title}</td>
      <td>{EVENT_TYPES[event.type] || event.type}</td>
      <td>{event.date.split('-').reverse().join('.')}</td>
      <td>{event.capacity}</td>
      <td>{event.description}</td>
      {isAdmin && (
        <td>
          {event.pending ? (
            <span className="muted">сохранение...</span>
          ) : (
            <>
              <button onClick={() => onEdit(event)}>Изменить</button>
              <button className="danger" onClick={() => onDelete(event)}>Удалить</button>
            </>
          )}
        </td>
      )}
    </tr>
  );
}

export default EventItem;

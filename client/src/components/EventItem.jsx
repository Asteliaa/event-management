import { EVENT_TYPES } from '../data/eventTypes.js';

function EventItem({ event, isAdmin, isLoggedIn, isChatOpen, onEdit, onDelete, onChat, onRegister }) {
  return (
    <tr className={`${event.pending ? 'pending' : ''} ${isChatOpen ? 'selected' : ''}`}>
      <td>{event.title}</td>
      <td>{EVENT_TYPES[event.type] || event.type}</td>
      <td>{event.date.split('-').reverse().join('.')}</td>
      <td>{event.capacity}</td>
      <td>{event.description}</td>
      {isLoggedIn && (
        <td>
          {event.pending ? (
            <span className="muted">сохранение...</span>
          ) : (
            <>
              <button onClick={() => onChat(event)}>Чат</button>
              <button onClick={() => onRegister(event)}>Записаться</button>
              {isAdmin && (
                <>
                  <button onClick={() => onEdit(event)}>Изменить</button>
                  <button className="danger" onClick={() => onDelete(event)}>Удалить</button>
                </>
              )}
            </>
          )}
        </td>
      )}
    </tr>
  );
}

export default EventItem;

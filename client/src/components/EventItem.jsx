import { EVENT_TYPES } from '../data/demoEvents.js';

function EventItem({ event, onEdit, onDelete }) {
  return (
    <tr>
      <td>{event.title}</td>
      <td>{EVENT_TYPES[event.type]}</td>
      <td>{event.date.split('-').reverse().join('.')}</td>
      <td>{event.capacity}</td>
      <td>{event.description}</td>
      <td>
        <button onClick={() => onEdit(event)}>Изменить</button>
        <button className="danger" onClick={() => onDelete(event.id)}>Удалить</button>
      </td>
    </tr>
  );
}

export default EventItem;

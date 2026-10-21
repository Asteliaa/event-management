import { useEffect, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { demoEvents, EVENT_TYPES } from '../data/demoEvents.js';
import EventForm from './EventForm.jsx';
import EventItem from './EventItem.jsx';

// Сегодняшняя дата в формате ГГГГ-ММ-ДД (для подсчёта предстоящих)
const today = new Date().toLocaleDateString('sv');

function EventList() {
  // Список мероприятий хранится в localStorage
  const [events, setEvents, loading, savedAt] = useLocalStorage('events', demoEvents);
  // Мероприятие, которое сейчас редактируется
  const [editingEvent, setEditingEvent] = useState(null);
  // Фильтр и сортировка
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');

  // Заголовок вкладки показывает количество мероприятий
  useEffect(() => {
    document.title = `Мероприятия (${events.length})`;
  }, [events]);

  function handleSave(data) {
    if (editingEvent) {
      setEvents((prev) => prev.map((e) => (e.id === editingEvent.id ? { ...data, id: e.id } : e)));
      setEditingEvent(null);
    } else {
      setEvents((prev) => [...prev, { ...data, id: Date.now() }]);
    }
  }

  function handleDelete(id) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (editingEvent && editingEvent.id === id) setEditingEvent(null);
  }

  if (loading) {
    return <p>Загрузка...</p>;
  }

  // Фильтрация и сортировка
  const visible = events
    .filter((e) => typeFilter === 'all' || e.type === typeFilter)
    .filter((e) => e.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'capacity') return b.capacity - a.capacity;
      return a.date.localeCompare(b.date);
    });

  // Статистика
  const upcoming = events.filter((e) => e.date >= today).length;
  const totalSeats = events.reduce((sum, e) => sum + e.capacity, 0);

  return (
    <div>
      <EventForm
        key={editingEvent ? editingEvent.id : 'new'}
        editingEvent={editingEvent}
        onSave={handleSave}
        onCancel={() => setEditingEvent(null)}
      />

      <div className="filters">
        <input
          placeholder="Поиск по названию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Все типы</option>
          {Object.entries(EVENT_TYPES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="date">По дате</option>
          <option value="title">По названию</option>
          <option value="capacity">По количеству мест</option>
        </select>
      </div>

      <p>
        Всего: {events.length}, предстоящих: {upcoming}, прошедших: {events.length - upcoming},
        мест: {totalSeats}
      </p>

      {visible.length === 0 ? (
        <p>Мероприятий не найдено</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Дата</th>
              <th>Мест</th>
              <th>Описание</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((event) => (
              <EventItem key={event.id} event={event} onEdit={setEditingEvent} onDelete={handleDelete} />
            ))}
          </tbody>
        </table>
      )}

      {savedAt && <p className="saved">Сохранено в {savedAt.toLocaleTimeString('ru-RU')}</p>}
    </div>
  );
}

export default EventList;

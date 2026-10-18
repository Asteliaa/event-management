import { useCallback, useMemo, useState } from 'react';
import { demoEvents } from '../data/demoEvents.js';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { filterEvents, getStats, sortEvents } from '../utils/events.js';
import EventForm from './EventForm.jsx';
import EventFilters from './EventFilters.jsx';
import EventItem from './EventItem.jsx';
import EventStats from './EventStats.jsx';
import StoragePreview from './StoragePreview.jsx';

export const STORAGE_KEY = 'event-management:events';

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function EventList() {
  // Массив мероприятий: загрузка при монтировании (1 с) и автосохранение (debounce 500 мс)
  const {
    value: events,
    setValue: setEvents,
    isLoading,
    isDirty,
    savedAt,
  } = useLocalStorage(STORAGE_KEY, demoEvents, { loadDelay: 1000, saveDelay: 500 });

  // id редактируемого мероприятия (null – режим добавления)
  const [editingId, setEditingId] = useState(null);
  // Состояние фильтра и сортировки
  const [filters, setFilters] = useState({ query: '', type: 'all', period: 'all', sortBy: 'date-asc' });

  // Производные данные вычисляются при рендере и не хранятся в состоянии
  const visibleEvents = useMemo(
    () => sortEvents(filterEvents(events, filters), filters.sortBy),
    [events, filters],
  );
  const stats = useMemo(() => getStats(events), [events]);
  const editingEvent = events.find((event) => event.id === editingId) ?? null;

  useDocumentTitle(isLoading ? 'Загрузка… | Event Management' : `Мероприятия (${events.length}) | Event Management`);

  const handleSubmit = (data) => {
    if (editingEvent) {
      setEvents((prev) => prev.map((event) => (event.id === editingEvent.id ? { ...data, id: event.id } : event)));
      setEditingId(null);
    } else {
      setEvents((prev) => [...prev, { id: crypto.randomUUID(), ...data }]);
    }
  };

  // useCallback сохраняет ссылки на функции между рендерами, иначе React.memo в EventItem бесполезен
  const handleDelete = useCallback((id) => {
    setEvents((prev) => prev.filter((event) => event.id !== id));
    setEditingId((current) => (current === id ? null : current));
  }, [setEvents]);

  const handleEdit = useCallback((id) => setEditingId(id), []);
  const handleCancel = useCallback(() => setEditingId(null), []);

  if (isLoading) {
    return (
      <div className="card loading" role="status">
        <span className="spinner" aria-hidden="true" />
        Загрузка мероприятий…
      </div>
    );
  }

  let saveStatus = 'Данные загружены';
  if (isDirty) saveStatus = 'Сохранение…';
  else if (savedAt) saveStatus = `Сохранено в ${timeFormat.format(savedAt)}`;

  return (
    <>
      <EventStats stats={stats} />
      <EventForm key={editingId ?? 'new'} editingEvent={editingEvent} onSubmit={handleSubmit} onCancel={handleCancel} />
      <EventFilters filters={filters} onChange={setFilters} />

      <div className="list-header">
        <h2>Список мероприятий</h2>
        <span className="save-status" aria-live="polite">{saveStatus}</span>
      </div>

      {visibleEvents.length === 0 ? (
        <p className="card empty">
          {events.length === 0
            ? 'Мероприятий пока нет. Добавьте первое с помощью формы выше.'
            : 'Ничего не найдено по заданным условиям.'}
        </p>
      ) : (
        <ul className="event-list">
          {visibleEvents.map((event) => (
            <EventItem
              key={event.id}
              event={event}
              isEditing={event.id === editingId}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
      <p className="shown">Показано {visibleEvents.length} из {events.length}</p>
      <StoragePreview storageKey={STORAGE_KEY} />
    </>
  );
}

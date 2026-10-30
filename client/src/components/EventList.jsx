import { useEffect, useState } from 'react';
import {
  fetchEvents, addEvent, updateEvent, deleteEvent, registerForEvent, getErrorMessage, toClient,
} from '../api.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { EVENT_TYPES } from '../data/eventTypes.js';
import EventForm from './EventForm.jsx';
import EventItem from './EventItem.jsx';

// Сегодняшняя дата в формате ГГГГ-ММ-ДД (для подсчета предстоящих)
const today = new Date().toLocaleDateString('sv');

function EventList({ isAdmin, isLoggedIn, socket, chatEventId, onChat, onNotify, onUnauthorized }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Уведомление об ошибке при сохранении (после отката)
  const [notice, setNotice] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);
  // Поиск выполняется на сервере, запрос уходит через 500 мс после ввода
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 500);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  // Увеличивается по кнопке «Повторить», чтобы перезапустить загрузку
  const [reloadKey, setReloadKey] = useState(0);

  // Загрузка списка (GET /events?search=&type=)
  useEffect(() => {
    // Предыдущий запрос отменяется, если фильтр изменился или компонент размонтирован
    const controller = new AbortController();
    setLoading(true);
    setError('');

    const params = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (typeFilter !== 'all') params.type = typeFilter;

    fetchEvents(params, controller.signal)
      .then((data) => {
        setEvents(data);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return; // запрос отменен, это не ошибка
        setError(getErrorMessage(err));
        setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedSearch, typeFilter, reloadKey]);

  // Синхронизация в реальном времени: изменения, сделанные в других окнах, приходят через Socket.IO
  useEffect(() => {
    if (!socket) return;
    const onCreated = ({ event }) =>
      // Если запись уже есть (добавлена оптимистично в этом окне), не дублируем
      setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [...prev, toClient(event)]));
    const onUpdated = ({ event }) =>
      setEvents((prev) => prev.map((e) => (e.id === event.id ? toClient(event) : e)));
    const onDeleted = ({ id }) => setEvents((prev) => prev.filter((e) => e.id !== id));

    socket.on('event:created', onCreated);
    socket.on('event:updated', onUpdated);
    socket.on('event:deleted', onDeleted);
    return () => {
      socket.off('event:created', onCreated);
      socket.off('event:updated', onUpdated);
      socket.off('event:deleted', onDeleted);
    };
  }, [socket]);

  useEffect(() => {
    document.title = `Мероприятия (${events.length})`;
  }, [events]);

  // Общая обработка ошибки сохранения: сообщение, а при 401 – выход
  function showSaveError(err) {
    setNotice(getErrorMessage(err));
    if (err.response && err.response.status === 401) onUnauthorized();
  }

  // Добавление с оптимистичным обновлением
  async function handleAdd(data) {
    const tempId = Date.now();
    // 1. Сразу показываем запись с временным id
    setEvents((prev) => [...prev, { ...data, id: tempId, pending: true }]);
    try {
      // 2. Отправляем POST
      const saved = await addEvent(data);
      // 3. Заменяем временную запись на ответ сервера (с настоящим id);
      // уведомление event:created могло прийти раньше ответа, поэтому убираем возможный дубль
      setEvents((prev) => prev.filter((e) => e.id !== saved.id).map((e) => (e.id === tempId ? saved : e)));
    } catch (err) {
      // 4. Ошибка: убираем запись и показываем уведомление
      setEvents((prev) => prev.filter((e) => e.id !== tempId));
      showSaveError(err);
    }
  }

  // Редактирование с оптимистичным обновлением
  async function handleUpdate(data) {
    const previous = editingEvent;
    setEditingEvent(null);
    setEvents((prev) => prev.map((e) => (e.id === previous.id ? { ...data, id: previous.id } : e)));
    try {
      const saved = await updateEvent(previous.id, data);
      setEvents((prev) => prev.map((e) => (e.id === previous.id ? saved : e)));
    } catch (err) {
      // Откат к прежней версии записи
      setEvents((prev) => prev.map((e) => (e.id === previous.id ? previous : e)));
      showSaveError(err);
    }
  }

  // Удаление с оптимистичным обновлением
  async function handleDelete(event) {
    if (editingEvent && editingEvent.id === event.id) setEditingEvent(null);
    const index = events.findIndex((e) => e.id === event.id);
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    try {
      await deleteEvent(event.id);
    } catch (err) {
      // Возвращаем запись на прежнее место
      setEvents((prev) => [...prev.slice(0, index), event, ...prev.slice(index)]);
      showSaveError(err);
    }
  }

  // Регистрация на мероприятие; уведомление об успехе показывается во всплывающем окне
  async function handleRegister(event) {
    try {
      await registerForEvent(event.id);
      onNotify(`Вы записаны на «${event.title}»`, 'success');
    } catch (err) {
      showSaveError(err);
    }
  }

  // Сортировка на клиенте
  const visible = [...events].sort((a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'capacity') return (b.capacity || 0) - (a.capacity || 0);
    return a.date.localeCompare(b.date);
  });

  // Статистика по загруженному списку
  const upcoming = events.filter((e) => e.date >= today).length;
  const totalSeats = events.reduce((sum, e) => sum + (e.capacity || 0), 0);

  return (
    <div>
      {isAdmin ? (
        <EventForm
          key={editingEvent ? editingEvent.id : 'new'}
          editingEvent={editingEvent}
          onSave={editingEvent ? handleUpdate : handleAdd}
          onCancel={() => setEditingEvent(null)}
        />
      ) : (
        <p className="hint">
          Добавлять и изменять мероприятия может только администратор.{' '}
          {isLoggedIn ? 'Можно записаться на мероприятие и обсудить его в чате.' : 'Войдите, чтобы записаться и открыть чат.'}
        </p>
      )}

      {notice && (
        <div className="notice">
          {notice}
          <button onClick={() => setNotice('')}>×</button>
        </div>
      )}

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

      {loading ? (
        <div className="loading">
          <span className="spinner" /> Загрузка...
        </div>
      ) : error ? (
        <div className="load-error">
          <p className="error">{error}</p>
          <button onClick={() => setReloadKey((k) => k + 1)}>Повторить</button>
        </div>
      ) : (
        <>
          <p className="stats">
            Найдено: <b>{events.length}</b> · предстоящих: <b>{upcoming}</b> · прошедших:{' '}
            <b>{events.length - upcoming}</b> · мест: <b>{totalSeats}</b>
          </p>

          {visible.length === 0 ? (
            <p className="empty">Мероприятий не найдено</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Тип</th>
                  <th>Дата</th>
                  <th>Мест</th>
                  <th>Описание</th>
                  {isLoggedIn && <th></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((event) => (
                  <EventItem
                    key={event.id}
                    event={event}
                    isAdmin={isAdmin}
                    isLoggedIn={isLoggedIn}
                    isChatOpen={event.id === chatEventId}
                    onEdit={setEditingEvent}
                    onDelete={handleDelete}
                    onChat={onChat}
                    onRegister={handleRegister}
                  />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default EventList;

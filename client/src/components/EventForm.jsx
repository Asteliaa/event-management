import { useState } from 'react';
import { EVENT_TYPES } from '../data/demoEvents.js';

const emptyForm = { title: '', type: 'conference', date: '', capacity: '', description: '' };

function EventForm({ editingEvent, onSave, onCancel }) {
  // Значения полей формы
  const [form, setForm] = useState(editingEvent ? { ...editingEvent } : emptyForm);
  const [error, setError] = useState('');

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Срабатывает по кнопке и по Enter в любом поле
  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.date || Number(form.capacity) < 1) {
      setError('Заполните название, дату и количество мест (больше 0)');
      return;
    }
    onSave({ ...form, title: form.title.trim(), capacity: Number(form.capacity) });
    setError('');
    if (!editingEvent) setForm(emptyForm);
  }

  return (
    <form className="event-form" onSubmit={handleSubmit}>
      <h2>{editingEvent ? 'Редактирование' : 'Добавить мероприятие'}</h2>

      <label className="wide">
        Название
        <input name="title" value={form.title} onChange={handleChange} />
      </label>
      <label>
        Тип
        <select name="type" value={form.type} onChange={handleChange}>
          {Object.entries(EVENT_TYPES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label>
        Дата
        <input type="date" name="date" value={form.date} onChange={handleChange} />
      </label>
      <label>
        Мест
        <input type="number" name="capacity" value={form.capacity} onChange={handleChange} />
      </label>
      <label className="wide">
        Описание
        <input name="description" value={form.description} onChange={handleChange} />
      </label>

      {error && <p className="error wide">{error}</p>}

      <div className="form-buttons">
        <button type="submit" className="primary">{editingEvent ? 'Сохранить' : 'Добавить'}</button>
        {editingEvent && <button type="button" onClick={onCancel}>Отмена</button>}
      </div>
    </form>
  );
}

export default EventForm;

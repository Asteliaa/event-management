import { useEffect, useRef, useState } from 'react';
import { EVENT_TYPES } from '../data/demoEvents.js';

const emptyForm = { title: '', type: 'conference', date: '', capacity: '', description: '' };

function toForm(event) {
  return event ? { ...event, capacity: String(event.capacity) } : emptyForm;
}

function validate(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'Введите название';
  if (!form.date) errors.date = 'Укажите дату';
  const capacity = Number(form.capacity);
  if (form.capacity === '' || !Number.isInteger(capacity) || capacity < 1) {
    errors.capacity = 'Целое число от 1';
  }
  return errors;
}

// Контролируемая форма: значение каждого поля хранится в состоянии компонента
export default function EventForm({ editingEvent, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => toForm(editingEvent));
  const [errors, setErrors] = useState({});
  const titleRef = useRef(null);

  // Форма пересоздается через key при смене редактируемого мероприятия (см. EventList),
  // поэтому эффект нужен только для фокуса на поле названия
  useEffect(() => {
    if (editingEvent) titleRef.current?.focus();
  }, [editingEvent]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Функциональное обновление: новое состояние строится из предыдущего
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault(); // без перезагрузки страницы; Enter в любом поле тоже отправляет форму
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      capacity: Number(form.capacity),
    });
    if (!editingEvent) setForm(emptyForm);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && editingEvent) onCancel();
  };

  return (
    <form className="card event-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
      <h2>{editingEvent ? 'Редактирование мероприятия' : 'Новое мероприятие'}</h2>
      <div className="form-grid">
        <label className="field field-wide">
          <span>Название</span>
          <input ref={titleRef} name="title" value={form.title} onChange={handleChange}
            placeholder="Например, Митап по Node.js" />
          {errors.title && <small className="error">{errors.title}</small>}
        </label>
        <label className="field">
          <span>Тип</span>
          <select name="type" value={form.type} onChange={handleChange}>
            {Object.entries(EVENT_TYPES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Дата</span>
          <input type="date" name="date" value={form.date} onChange={handleChange} />
          {errors.date && <small className="error">{errors.date}</small>}
        </label>
        <label className="field">
          <span>Мест</span>
          <input type="number" min="1" name="capacity" value={form.capacity} onChange={handleChange} />
          {errors.capacity && <small className="error">{errors.capacity}</small>}
        </label>
        <label className="field field-wide">
          <span>Описание</span>
          <input name="description" value={form.description} onChange={handleChange}
            placeholder="Коротко о мероприятии" />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {editingEvent ? 'Сохранить' : 'Добавить'}
        </button>
        {editingEvent && (
          <button type="button" className="btn" onClick={onCancel}>Отмена</button>
        )}
        <span className="hint">Enter – {editingEvent ? 'сохранить' : 'добавить'}{editingEvent && ', Esc – отмена'}</span>
      </div>
    </form>
  );
}

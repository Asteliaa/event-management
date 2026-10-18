import { EVENT_TYPES } from '../data/demoEvents.js';

export default function EventFilters({ filters, onChange }) {
  const update = (e) => onChange((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  return (
    <div className="card filters">
      <label className="field field-wide">
        <span>Поиск</span>
        <input type="search" name="query" value={filters.query} onChange={update}
          placeholder="Название или описание" />
      </label>
      <label className="field">
        <span>Тип</span>
        <select name="type" value={filters.type} onChange={update}>
          <option value="all">Все типы</option>
          {Object.entries(EVENT_TYPES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Период</span>
        <select name="period" value={filters.period} onChange={update}>
          <option value="all">Все</option>
          <option value="upcoming">Предстоящие</option>
          <option value="past">Прошедшие</option>
        </select>
      </label>
      <label className="field">
        <span>Сортировка</span>
        <select name="sortBy" value={filters.sortBy} onChange={update}>
          <option value="date-asc">Дата, сначала ранние</option>
          <option value="date-desc">Дата, сначала поздние</option>
          <option value="title-asc">Название, А–Я</option>
          <option value="capacity-desc">Мест, по убыванию</option>
        </select>
      </label>
    </div>
  );
}

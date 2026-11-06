import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { categoriesApi, eventsApi } from '../../api/index.js';
import { TYPE_LABELS } from '../../utils/format.js';

// Панель фильтров каталога. Значения хранятся в адресной строке (?type=webinar&page=2),
// поэтому ссылкой на отфильтрованный список можно поделиться
export default function EventFilters({ values, search, onSearch, onChange, onReset }) {
  const { data: categories } = useFetch(() => categoriesApi.list(), []);
  const { data: cities } = useFetch(() => eventsApi.cities(), []);
  const active = ['type', 'category', 'city', 'online', 'when'].some((k) => values[k] && !(k === 'when' && values[k] === 'upcoming'));

  return (
    <div className="filters card">
      <div className="filters__search">
        <Search size={18} />
        <input
          type="search"
          placeholder="Поиск по названию, описанию или тегу"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Поиск"
        />
      </div>

      <div className="filters__row">
        <span className="filters__label"><SlidersHorizontal size={16} /> Фильтры</span>
        <select value={values.type || ''} onChange={(e) => onChange('type', e.target.value)} aria-label="Тип">
          <option value="">Все форматы</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={values.category || ''} onChange={(e) => onChange('category', e.target.value)} aria-label="Категория">
          <option value="">Все категории</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.eventsCount})</option>)}
        </select>
        <select value={values.city || ''} onChange={(e) => onChange('city', e.target.value)} aria-label="Город">
          <option value="">Все города</option>
          {cities?.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={values.online || ''} onChange={(e) => onChange('online', e.target.value)} aria-label="Онлайн">
          <option value="">Онлайн и офлайн</option>
          <option value="true">Только онлайн</option>
          <option value="false">Только офлайн</option>
        </select>
        <select value={values.when || 'upcoming'} onChange={(e) => onChange('when', e.target.value)} aria-label="Период">
          <option value="upcoming">Предстоящие</option>
          <option value="past">Прошедшие</option>
          <option value="all">Все</option>
        </select>
        <select value={values.sort || 'date'} onChange={(e) => onChange('sort', e.target.value)} aria-label="Сортировка">
          <option value="date">Сначала ближайшие</option>
          <option value="-date">Сначала поздние</option>
          <option value="popular">Популярные</option>
          <option value="new">Новые</option>
        </select>
        {active && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}><X size={15} /> Сбросить</button>
        )}
      </div>
    </div>
  );
}

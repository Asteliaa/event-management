import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { useFetch } from '../hooks/useFetch.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { categoriesApi, eventsApi } from '../api/index.js';
import EventRow, { EventRowSkeleton } from '../components/events/EventCard.jsx';
import { ErrorState } from '../components/ui/index.jsx';
import { plural } from '../utils/format.js';

const FORMATS = [
  { type: 'conference', title: 'Конференции', text: 'Доклады, секции и выставка компаний' },
  { type: 'webinar', title: 'Вебинары', text: 'Онлайн-трансляции с вопросами спикеру' },
  { type: 'meeting', title: 'Встречи', text: 'Воркшопы и круглые столы до 40 человек' },
];

export default function HomePage() {
  useDocumentTitle('');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const week = useFetch((signal) => eventsApi.list({ limit: 5, to: new Date(Date.now() + 7 * 864e5).toISOString() }, signal), []);
  const upcoming = useFetch((signal) => eventsApi.list({ limit: 6, sort: 'popular' }, signal), []);
  const { data: categories } = useFetch(() => categoriesApi.list(), []);

  const submit = (e) => {
    e.preventDefault();
    navigate(query.trim() ? `/events?search=${encodeURIComponent(query.trim())}` : '/events');
  };

  return (
    <>
      <section className="home-hero container">
        <div className="home-hero__intro">
          <h1>Конференции, вебинары и встречи в Минске и онлайн</h1>
          <p className="lead">
            Регистрируйтесь на мероприятия, общайтесь с другими участниками и получайте напоминание
            за день до начала, чтобы ничего не пропустить.
          </p>
          <form className="search search--hero" onSubmit={submit} role="search">
            <Search size={20} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например, React или маркетинг" aria-label="Поиск мероприятий" />
            <button type="submit" className="btn btn--primary">Найти</button>
          </form>
          {upcoming.data && (
            <p className="muted">
              Впереди {upcoming.data.meta.total} {plural(upcoming.data.meta.total, ['мероприятие', 'мероприятия', 'мероприятий'])}. <Link to="/events">Открыть всю программу</Link>
            </p>
          )}
        </div>

        <aside className="week" aria-labelledby="week-title">
          <h2 id="week-title" className="week__title">Ближайшие 7 дней</h2>
          {week.error && <ErrorState message={week.error} onRetry={week.reload} />}
          <div className="agenda agenda--compact">
            {week.loading && !week.data && Array.from({ length: 4 }, (_, i) => <EventRowSkeleton key={i} compact />)}
            {week.data?.data.map((e) => <EventRow key={e.id} event={e} compact />)}
            {week.data?.data.length === 0 && <p className="muted week__empty">На этой неделе мероприятий нет.</p>}
          </div>
        </aside>
      </section>

      <section className="section container">
        <div className="section__head">
          <h2>Больше всего регистраций</h2>
          <Link to="/events?sort=popular">Все популярные</Link>
        </div>
        {upcoming.error ? <ErrorState message={upcoming.error} onRetry={upcoming.reload} /> : (
          <div className="agenda">
            {upcoming.loading && !upcoming.data && Array.from({ length: 3 }, (_, i) => <EventRowSkeleton key={i} />)}
            {upcoming.data?.data.map((e) => <EventRow key={e.id} event={e} />)}
          </div>
        )}
      </section>

      <section className="section container topics">
        <div>
          <h2>Форматы</h2>
          <ul className="link-list">
            {FORMATS.map((f) => (
              <li key={f.type}>
                <Link to={`/events?type=${f.type}`}><span className={`type type--${f.type}`}>{f.title}</span></Link>
                <span className="muted">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Темы</h2>
          <ul className="link-list">
            {categories?.map((c) => (
              <li key={c.id}>
                <Link to={`/events?category=${c.id}`} className="cat-mark" style={{ '--cat': c.color }}>{c.name}</Link>
                <span className="muted">{c.eventsCount} {plural(c.eventsCount, ['мероприятие', 'мероприятия', 'мероприятий'])}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

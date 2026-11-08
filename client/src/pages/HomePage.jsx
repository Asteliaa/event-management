import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Search } from 'lucide-react';
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
// Номера пунктов (01, 02, 03) рисуются в CSS через counter
const POINTS = [
  { title: 'Регистрация в один клик', text: 'Выберите количество билетов, места бронируются сразу' },
  { title: 'Напоминания', text: 'Автоматически за сутки до начала и в удобное вам время' },
  { title: 'Чат участников', text: 'Общайтесь с другими участниками до и во время события' },
];
const EVENTS_WORDS = ['мероприятие', 'мероприятия', 'мероприятий'];

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
          <p className="home-hero__kicker mono-label">Минск, Гродно, Брест и онлайн</p>
          <h1>Конференции, вебинары и <span className="mark">встречи</span></h1>
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
            <p className="home-hero__stats">
              <span className="sticker">Впереди {upcoming.data.meta.total} {plural(upcoming.data.meta.total, EVENTS_WORDS)}</span>
              <Link to="/events">Открыть каталог →</Link>
            </p>
          )}
        </div>

        <aside className="week card" aria-labelledby="week-title">
          <h2 id="week-title" className="week__title">Ближайшие 7 дней <span className="mono-label">неделя</span></h2>
          {week.error && <ErrorState message={week.error} onRetry={week.reload} />}
          <div className="agenda agenda--compact">
            {week.loading && !week.data && Array.from({ length: 4 }, (_, i) => <EventRowSkeleton key={i} compact />)}
            {week.data?.data.map((e) => <EventRow key={e.id} event={e} compact />)}
            {week.data?.data.length === 0 && <p className="muted week__empty">На этой неделе мероприятий нет.</p>}
          </div>
        </aside>
      </section>

      <section className="band" aria-label="Возможности">
        <ul className="points container">
          {POINTS.map(({ title, text }) => (
            <li key={title}><span><b>{title}</b>{text}</span></li>
          ))}
        </ul>
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

      <section className="section container">
        <div className="section__head"><h2>Форматы</h2></div>
        <nav className="formats" aria-label="Форматы мероприятий">
          {FORMATS.map(({ type, title, text }, i) => (
            <Link key={type} to={`/events?type=${type}`} className="format-row">
              <span className="format-row__num">0{i + 1}</span>
              <span className="format-row__title">{title}</span>
              <span className="format-row__text">{text}</span>
              <span className="format-row__arrow" aria-hidden="true"><ArrowRight size={22} /></span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="section container">
        <div className="section__head"><h2>Темы</h2></div>
        <div className="topics">
          {categories?.map((c) => (
            <Link key={c.id} to={`/events?category=${c.id}`} className="topic">
              <span className="color-dot" style={{ background: c.color }} />
              <span className="topic__name">{c.name}</span>
              <span className="topic__count">{c.eventsCount}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

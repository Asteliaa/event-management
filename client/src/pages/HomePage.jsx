import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BellRing, MessageCircle, MonitorPlay, Presentation, Search, Ticket, UsersRound } from 'lucide-react';
import { useFetch } from '../hooks/useFetch.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { categoriesApi, eventsApi } from '../api/index.js';
import EventRow, { EventRowSkeleton } from '../components/events/EventCard.jsx';
import { ErrorState } from '../components/ui/index.jsx';
import { plural } from '../utils/format.js';

const FORMATS = [
  { type: 'conference', icon: Presentation, title: 'Конференции', text: 'Доклады, секции и выставка компаний' },
  { type: 'webinar', icon: MonitorPlay, title: 'Вебинары', text: 'Онлайн-трансляции с вопросами спикеру' },
  { type: 'meeting', icon: UsersRound, title: 'Встречи', text: 'Воркшопы и круглые столы до 40 человек' },
];
const POINTS = [
  { icon: Ticket, title: 'Регистрация в один клик', text: 'Выберите количество билетов, места бронируются сразу' },
  { icon: BellRing, title: 'Напоминания', text: 'Автоматически за сутки до начала и в удобное вам время' },
  { icon: MessageCircle, title: 'Чат участников', text: 'Общайтесь с другими участниками до и во время события' },
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
            <p className="home-hero__stats">
              <span>Впереди {upcoming.data.meta.total} {plural(upcoming.data.meta.total, EVENTS_WORDS)}</span>
              <Link to="/events">Открыть каталог</Link>
            </p>
          )}
          <ul className="points">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="points__icon"><Icon size={18} /></span>
                <span><b>{title}</b>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="week card" aria-labelledby="week-title">
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

      <section className="section container">
        <div className="section__head"><h2>Форматы</h2></div>
        <div className="formats">
          {FORMATS.map(({ type, icon: Icon, title, text }) => (
            <Link key={type} to={`/events?type=${type}`} className="card format-card">
              <span className={`format-card__icon format-card__icon--${type}`}><Icon size={20} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="section__head"><h2>Темы</h2></div>
        <div className="topics">
          {categories?.map((c) => (
            <Link key={c.id} to={`/events?category=${c.id}`} className="card topic">
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

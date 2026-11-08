import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Search } from 'lucide-react';
import { useFetch } from '../hooks/useFetch.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { categoriesApi, eventsApi } from '../api/index.js';
import EventCard, { EventCardSkeleton } from '../components/events/EventCard.jsx';
import { ErrorState } from '../components/ui/index.jsx';
import { TYPE_LABELS, plural } from '../utils/format.js';

// Номера пунктов рисуются в CSS через counter
const POINTS = [
  { title: 'Запись за минуту', text: 'Выберите число билетов, места бронируются сразу' },
  { title: 'Напоминания', text: 'Автоматически за сутки до начала и в удобное вам время' },
  { title: 'Чат участников', text: 'Общайтесь с другими участниками до и во время встречи' },
];
const EVENTS_WORDS = ['мероприятие', 'мероприятия', 'мероприятий'];
const TYPE_PLURALS = { conference: 'Конференции', webinar: 'Вебинары', meeting: 'Встречи' };

export default function HomePage() {
  useDocumentTitle('');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  // ближайшие по дате: первое – на первый экран, остальные – в ленту
  const upcoming = useFetch((signal) => eventsApi.list({ limit: 7 }, signal), []);
  const { data: categories } = useFetch(() => categoriesApi.list(), []);
  const [featured, ...feed] = upcoming.data?.data || [];

  const submit = (e) => {
    e.preventDefault();
    navigate(query.trim() ? `/events?search=${encodeURIComponent(query.trim())}` : '/events');
  };

  return (
    <>
      <section className="home-hero container">
        <div className="home-hero__intro">
          <p className="home-hero__kicker">Минск, Гродно, Брест и онлайн</p>
          <h1>Встречи, после которых есть что <span className="mark">обсудить</span></h1>
          <p className="lead">
            Конференции, вебинары и встречи IT-сообществ и учебных подразделений. Записывайтесь,
            общайтесь с участниками и получайте напоминание за день до начала.
          </p>
          <div className="home-hero__actions">
            <Link to="/events" className="btn btn--primary btn--lg">Найти мероприятие <ArrowRight size={18} /></Link>
            {upcoming.data && (
              <p className="home-hero__stats">Впереди <b>{upcoming.data.meta.total}</b> {plural(upcoming.data.meta.total, EVENTS_WORDS)}</p>
            )}
          </div>
        </div>

        <aside className="home-hero__feature" aria-label="Ближайшее мероприятие">
          <p className="mono-label">Ближайшее</p>
          {upcoming.loading && !upcoming.data && <EventCardSkeleton />}
          {featured && <EventCard event={featured} feature />}
        </aside>
      </section>

      <section className="container">
        <div className="finder card">
          <form className="search search--hero" onSubmit={submit} role="search">
            <Search size={20} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например, React или маркетинг" aria-label="Поиск мероприятий" />
            <button type="submit" className="btn btn--primary">Найти</button>
          </form>
          <div className="finder__groups">
            <span className="finder__label">Формат</span>
            <nav className="pills" aria-label="Форматы">
              {Object.keys(TYPE_LABELS).map((type) => (
                <Link key={type} to={`/events?type=${type}`} className="pill">{TYPE_PLURALS[type] || TYPE_LABELS[type]}</Link>
              ))}
            </nav>
            <span className="finder__label">Темы</span>
            <nav className="pills" aria-label="Темы">
              {categories?.map((c) => (
                <Link key={c.id} to={`/events?category=${c.id}`} className="pill">
                  <span className="color-dot" style={{ background: c.color }} />
                  {c.name} <span className="pill__count">{c.eventsCount}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="section__head">
          <h2>Скоро</h2>
          <Link to="/events">Весь каталог →</Link>
        </div>
        {upcoming.error ? <ErrorState message={upcoming.error} onRetry={upcoming.reload} /> : (
          <div className="posters">
            {upcoming.loading && !upcoming.data && Array.from({ length: 3 }, (_, i) => <EventCardSkeleton key={i} />)}
            {feed.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}
      </section>

      <section className="band" aria-label="Возможности">
        <ul className="points container">
          {POINTS.map(({ title, text }) => (
            <li key={title}><span><b>{title}</b>{text}</span></li>
          ))}
        </ul>
      </section>
    </>
  );
}

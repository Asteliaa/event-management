import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, BellRing, CalendarCheck, Mic, MonitorPlay, Search, Users } from 'lucide-react';
import { useFetch } from '../hooks/useFetch.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { categoriesApi, eventsApi } from '../api/index.js';
import EventCard, { EventCardSkeleton } from '../components/events/EventCard.jsx';
import { ErrorState } from '../components/ui/index.jsx';
import { plural } from '../utils/format.js';

const STEPS = [
  { icon: Search, title: 'Найдите мероприятие', text: 'Фильтры по формату, категории, городу и дате помогут выбрать интересное.' },
  { icon: CalendarCheck, title: 'Зарегистрируйтесь', text: 'Одна кнопка – и место за вами. Счетчик мест обновляется сразу.' },
  { icon: BellRing, title: 'Получите напоминание', text: 'Напомним за сутки автоматически, а еще – когда вам удобно.' },
];

const FORMATS = [
  { type: 'conference', icon: Mic, title: 'Конференции', text: 'Доклады экспертов и нетворкинг' },
  { type: 'webinar', icon: MonitorPlay, title: 'Вебинары', text: 'Онлайн из любой точки мира' },
  { type: 'meeting', icon: Users, title: 'Встречи', text: 'Камерные воркшопы и круглые столы' },
];

export default function HomePage() {
  useDocumentTitle('');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const upcoming = useFetch((signal) => eventsApi.list({ limit: 6 }, signal), []);
  const { data: categories } = useFetch(() => categoriesApi.list(), []);

  const submit = (e) => {
    e.preventDefault();
    navigate(query.trim() ? `/events?search=${encodeURIComponent(query.trim())}` : '/events');
  };

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__text">
            <span className="hero__badge"><BellRing size={14} /> Регистрация и напоминания в одном месте</span>
            <h1>Конференции, вебинары и встречи, <span className="gradient-text">которые нельзя пропустить</span></h1>
            <p>EventHub собирает мероприятия в одном каталоге: регистрируйтесь в один клик, общайтесь с участниками в чате и получайте напоминания вовремя.</p>
            <form className="hero__search" onSubmit={submit}>
              <Search size={20} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="React, стартап, дизайн…" aria-label="Поиск мероприятий" />
              <button type="submit" className="btn btn--primary">Найти</button>
            </form>
            <div className="hero__stats">
              <div><b>{upcoming.data?.meta.total ?? '—'}</b><span>{plural(upcoming.data?.meta.total || 0, ['мероприятие', 'мероприятия', 'мероприятий'])} впереди</span></div>
              <div><b>{categories?.length ?? '—'}</b><span>категорий</span></div>
              <div><b>24/7</b><span>онлайн-регистрация</span></div>
            </div>
          </div>
          <div className="hero__art" aria-hidden="true">
            <div className="hero__card hero__card--1"><Mic size={28} /><span>DevDay 2026</span></div>
            <div className="hero__card hero__card--2"><BellRing size={28} /><span>Начало через 1 час</span></div>
            <div className="hero__card hero__card--3"><Users size={28} /><span>+128 участников</span></div>
            <div className="hero__blob" />
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="section__head">
          <h2>Ближайшие мероприятия</h2>
          <Link to="/events" className="link-arrow">Все мероприятия <ArrowRight size={16} /></Link>
        </div>
        {upcoming.error ? <ErrorState message={upcoming.error} onRetry={upcoming.reload} /> : (
          <div className="grid grid--cards">
            {upcoming.loading && !upcoming.data
              ? Array.from({ length: 3 }, (_, i) => <EventCardSkeleton key={i} />)
              : upcoming.data.data.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}
      </section>

      <section className="section container">
        <h2>Форматы</h2>
        <div className="grid grid--3">
          {FORMATS.map(({ type, icon: Icon, title, text }) => (
            <Link key={type} to={`/events?type=${type}`} className={`card format format--${type}`}>
              <Icon size={28} />
              <h3>{title}</h3>
              <p>{text}</p>
            </Link>
          ))}
        </div>
      </section>

      {categories?.length > 0 && (
        <section className="section container">
          <h2>Категории</h2>
          <div className="categories">
            {categories.map((c) => (
              <Link key={c.id} to={`/events?category=${c.id}`} className="category-pill" style={{ '--chip': c.color }}>
                <span className="category-pill__dot" />
                {c.name}
                <span className="category-pill__count">{c.eventsCount}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section container">
        <h2>Как это работает</h2>
        <div className="grid grid--3 steps">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="step">
              <span className="step__num">{i + 1}</span>
              <Icon size={26} />
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

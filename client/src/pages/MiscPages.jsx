import { Link } from 'react-router';
import { BarChart3, BellRing, Database, Lock, MessageCircle, MonitorSmartphone, Server, Compass } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const FEATURES = [
  { icon: Compass, title: 'Каталог', text: 'Поиск, фильтры по формату, категории, городу и дате, сортировка и пагинация.' },
  { icon: BellRing, title: 'Напоминания', text: 'Автоматически за сутки до начала и свои напоминания; доставка в реальном времени.' },
  { icon: MessageCircle, title: 'Чат участников', text: 'Общение зарегистрированных участников на Socket.IO с историей сообщений.' },
  { icon: Lock, title: 'Безопасность', text: 'JWT, bcrypt, роли, helmet, CORS, ограничение попыток входа и валидация данных.' },
  { icon: Server, title: 'REST API', text: 'Express, версия /api/v1, единый формат ошибок, документация OpenAPI (Swagger).' },
  { icon: Database, title: 'MongoDB', text: 'Mongoose, 6 коллекций, индексы, агрегации и атомарное бронирование мест.' },
  { icon: BarChart3, title: 'Админ-панель', text: 'Статистика, управление мероприятиями, категориями и пользователями, выгрузка участников в CSV.' },
  { icon: MonitorSmartphone, title: 'Адаптивность', text: 'Интерфейс на CSS Grid и Flexbox для телефона, планшета и компьютера, темная тема.' },
];

export function AboutPage() {
  useDocumentTitle('О проекте');
  return (
    <div className="container page about">
      <header className="page__head">
        <h1>О проекте</h1>
        <p className="lead">
          EventHub – веб-приложение для организации конференций, вебинаров и встреч с регистрацией участников
          и напоминаниями. Курсовая работа по дисциплине «Интернет-технологии и веб-программирование» (БГУИР).
        </p>
      </header>
      <div className="features">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card feature"><span className="feature__icon"><Icon size={20} /></span><h3>{title}</h3><p>{text}</p></div>
        ))}
      </div>
      <section className="card panel">
        <h3 className="panel__title">Технологии</h3>
        <p className="tags">
          {['React 19', 'React Router 7', 'Context + useReducer', 'Vite', 'Node.js', 'Express', 'MongoDB', 'Mongoose', 'Socket.IO', 'JWT', 'Zod', 'Jest', 'Docker', 'GitHub Actions']
            .map((t) => <span key={t} className="tag">{t}</span>)}
        </p>
      </section>
    </div>
  );
}

export function NotFoundPage() {
  useDocumentTitle('Страница не найдена');
  return (
    <div className="container page not-found">
      <span className="not-found__code">404</span>
      <h1>Страница не найдена</h1>
      <p className="muted">Возможно, мероприятие удалено или ссылка набрана с ошибкой.</p>
      <div className="row-center">
        <Link to="/" className="btn btn--primary">На главную</Link>
        <Link to="/events" className="btn btn--ghost">К мероприятиям</Link>
      </div>
    </div>
  );
}

import { Suspense } from 'react';
import { Link, Outlet } from 'react-router';
import Header from './Header.jsx';
import Toasts from '../ui/Toasts.jsx';
import { Spinner } from '../ui/index.jsx';
import { API_URL } from '../../api/client.js';

const DOCS_URL = `${new URL(API_URL, window.location.origin).origin}/api/docs`;

// Общий каркас всех страниц: шапка, содержимое текущего маршрута (Outlet), подвал
export default function Layout() {
  return (
    <div className="app">
      <Header />
      <main className="main">
        <Suspense fallback={<div className="container"><Spinner /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="footer">
        <div className="container footer__inner">
          <span>© {new Date().getFullYear()} EventHub — конференции, вебинары и встречи</span>
          <nav>
            <Link to="/events">Мероприятия</Link>
            <Link to="/about">О проекте</Link>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">API</a>
          </nav>
        </div>
      </footer>
      <Toasts />
    </div>
  );
}

import { NavLink, Outlet } from 'react-router';
import { CalendarRange, LayoutDashboard, Tags, Users } from 'lucide-react';

const LINKS = [
  { to: '/admin', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/admin/events', label: 'Мероприятия', icon: CalendarRange },
  { to: '/admin/categories', label: 'Категории', icon: Tags },
  { to: '/admin/users', label: 'Пользователи', icon: Users },
];

// Админ-панель загружается отдельным файлом (React.lazy) только для администраторов
export default function AdminLayout() {
  return (
    <div className="container page admin">
      <aside className="admin__nav card">
        <h2 className="admin__title">Админ-панель</h2>
        <nav>
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="admin__link"><Icon size={18} /> {label}</NavLink>
          ))}
        </nav>
      </aside>
      <section className="admin__content"><Outlet /></section>
    </div>
  );
}

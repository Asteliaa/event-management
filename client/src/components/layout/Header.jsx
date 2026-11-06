import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { CalendarHeart, LayoutDashboard, LogOut, Menu, Moon, Sun, User, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import NotificationBell from './NotificationBell.jsx';

const NAV = [
  { to: '/', label: 'Главная', end: true },
  { to: '/events', label: 'Мероприятия' },
  { to: '/about', label: 'О проекте' },
];

export default function Header() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // мобильное меню закрывается при переходе на другую страницу
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const initials = user?.name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="header">
      <div className="container header__inner">
        <Link to="/" className="logo">
          <span className="logo__icon"><CalendarHeart size={22} /></span>
          <span>Event<b>Hub</b></span>
        </Link>

        <nav className={`nav ${menuOpen ? 'is-open' : ''}`} aria-label="Основная навигация">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav__link">{item.label}</NavLink>
          ))}
          {isAuthenticated && <NavLink to="/profile" className="nav__link nav__link--mobile">Личный кабинет</NavLink>}
          {isAdmin && <NavLink to="/admin" className="nav__link nav__link--mobile">Админ-панель</NavLink>}
          {!isAuthenticated && <NavLink to="/login" className="nav__link nav__link--mobile">Войти</NavLink>}
        </nav>

        <div className="header__actions">
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label="Сменить тему">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          {isAuthenticated ? (
            <>
              <NotificationBell />
              {isAdmin && (
                <NavLink to="/admin" className="icon-btn hide-mobile" aria-label="Админ-панель" title="Админ-панель">
                  <LayoutDashboard size={20} />
                </NavLink>
              )}
              <NavLink to="/profile" className="avatar-link hide-mobile" title="Личный кабинет">
                <span className="avatar">{initials || <User size={16} />}</span>
                <span className="avatar-link__name">{user.name.split(' ')[0]}</span>
              </NavLink>
              <button type="button" className="icon-btn hide-mobile" onClick={handleLogout} aria-label="Выйти" title="Выйти">
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <div className="hide-mobile header__auth">
              <Link to="/login" className="btn btn--ghost">Войти</Link>
              <Link to="/register" className="btn btn--primary">Регистрация</Link>
            </div>
          )}
          {isAuthenticated && (
            <button type="button" className="icon-btn show-mobile" onClick={handleLogout} aria-label="Выйти"><LogOut size={20} /></button>
          )}
          <button type="button" className="icon-btn burger" onClick={() => setMenuOpen((o) => !o)} aria-label="Меню" aria-expanded={menuOpen}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
    </header>
  );
}

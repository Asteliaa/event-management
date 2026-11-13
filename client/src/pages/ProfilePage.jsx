import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { BellRing, CalendarCheck, CalendarDays, Check, Heart, Settings, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { authApi, remindersApi } from '../api/index.js';
import { getErrorMessage, getFieldErrors } from '../api/client.js';
import EventRow, { DateBlock } from '../components/events/EventCard.jsx';
import { EmptyState, ErrorState, Field, Spinner } from '../components/ui/index.jsx';
import { STATUS_LABELS, TYPE_LABELS, formatDateTime, formatOffset, formatShort, formatTime, placeOf, timeUntil } from '../utils/format.js';

const TABS = [
  { to: '/profile', label: 'Регистрации', icon: CalendarCheck, end: true },
  { to: '/profile/favorites', label: 'Избранное', icon: Heart },
  { to: '/profile/reminders', label: 'Напоминания', icon: BellRing },
  { to: '/profile/settings', label: 'Настройки', icon: Settings },
];

// Личный кабинет: вложенные маршруты /profile/* отображаются в <Outlet />
export default function ProfileLayout() {
  const { user } = useAuth();
  return (
    <div className="container page">
      <header className="profile-head">
        <span className="avatar avatar--lg">{user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
        <div>
          <h1>{user.name}</h1>
          <p className="muted">{[user.email, user.city, user.role === 'admin' && 'администратор', user.role === 'organizer' && 'организатор'].filter(Boolean).join(', ')}</p>
        </div>
      </header>
      <nav className="tabs" aria-label="Разделы кабинета">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tabs__link"><Icon size={16} /> {label}</NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

export function MyRegistrations() {
  useDocumentTitle('Мои регистрации');
  const [when, setWhen] = useState('upcoming');
  // «Отмененные» – история отмен (повторная запись создает новую регистрацию, старая остается здесь)
  const params = when === 'cancelled' ? { when: 'all', status: 'cancelled' } : { when };
  const { data, loading, error, reload } = useFetch(() => authApi.myRegistrations(params), [when]);

  return (
    <section>
      <div className="segmented">
        {[['upcoming', 'Предстоящие'], ['past', 'Прошедшие'], ['all', 'Все'], ['cancelled', 'Отмененные']].map(([v, l]) => (
          <button key={v} type="button" className={when === v ? 'is-active' : ''} onClick={() => setWhen(v)}>{l}</button>
        ))}
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data?.length === 0 && (
        <EmptyState icon={CalendarDays} title="Регистраций нет" text="Выберите интересное мероприятие в каталоге.">
          <Link to="/events" className="btn btn--primary">Перейти в каталог</Link>
        </EmptyState>
      )}
      <div className="timeline">
        {data?.map((r) => (
          <Link key={r.id} to={`/events/${r.event.id}`} className="timeline__item">
            <DateBlock date={r.event.startsAt} size="sm" />
            <div className="timeline__body">
              <h3>{r.event.title}</h3>
              <p className="muted">{TYPE_LABELS[r.event.type]}, {formatTime(r.event.startsAt)}, {placeOf(r.event)}</p>
            </div>
            <div className="timeline__side">
              <span className={`chip chip--status-${r.status}`}>{STATUS_LABELS[r.status]}</span>
              <small className="muted">{r.status === 'cancelled' && r.cancelledAt ? `отменена ${formatShort(r.cancelledAt)}` : timeUntil(r.event.startsAt)}</small>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function MyFavorites() {
  useDocumentTitle('Избранное');
  const { data, loading, error, reload } = useFetch(() => authApi.favorites(), []);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data.length) return <EmptyState icon={Heart} title="В избранном пусто" text="Нажмите «В избранное» на странице мероприятия." />;
  return <div className="agenda">{data.map((e) => <EventRow key={e.id} event={e} />)}</div>;
}

export function MyReminders() {
  useDocumentTitle('Напоминания');
  const { notify } = useNotifications();
  const { data, loading, error, reload, setData } = useFetch(() => remindersApi.list(), []);

  async function remove(id) {
    const prev = data;
    setData((list) => list.filter((r) => r.id !== id));
    try {
      await remindersApi.remove(id);
    } catch (err) {
      setData(prev);
      notify(getErrorMessage(err), 'error');
    }
  }

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const pending = data.filter((r) => r.status === 'pending' && r.event).sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt));
  const sent = data.filter((r) => r.status === 'sent' && r.event);

  return (
    <section className="grid grid--2">
      <div className="card panel">
        <h3 className="panel__title"><BellRing size={18} /> Запланированные ({pending.length})</h3>
        {pending.length === 0 && <p className="muted">Нет запланированных напоминаний. Они создаются автоматически при регистрации.</p>}
        <ul className="reminders">
          {pending.map((r) => (
            <li key={r.id} className="reminder">
              <span className="reminder__icon"><BellRing size={16} /></span>
              <span className="reminder__text">
                <Link to={`/events/${r.event.id}`}><b>{r.event.title}</b></Link>
                <small>{formatOffset(r.offsetMinutes)} до начала, придет {formatDateTime(r.remindAt)} (по вашему времени){r.kind === 'auto' && ', автоматически'}</small>
              </span>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => remove(r.id)} aria-label="Удалить"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      </div>
      <div className="card panel">
        <div className="panel__title-row">
          <h3 className="panel__title"><Check size={18} /> Полученные ({sent.length})</h3>
          <Link to="/notifications" className="link-btn">Все уведомления</Link>
        </div>
        {sent.length === 0 && <p className="muted">Здесь появятся напоминания, когда наступит их время.</p>}
        <ul className="reminders">
          {sent.map((r) => (
            <li key={r.id} className="reminder reminder--sent">
              <span className="reminder__icon"><Check size={16} /></span>
              <span className="reminder__text">
                <Link to={`/events/${r.event.id}`}><b>{r.event.title}</b></Link>
                <small>Отправлено {formatDateTime(r.sentAt)}, начало {formatDateTime(r.event.startsAt, r.event.timezone)}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ProfileSettings() {
  useDocumentTitle('Настройки');
  const { user, updateUser } = useAuth();
  const { notify } = useNotifications();
  const [profile, setProfile] = useState({ name: user.name, city: user.city || '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');

  async function saveProfile(e) {
    e.preventDefault();
    setBusy('profile');
    setErrors({});
    try {
      updateUser(await authApi.updateProfile(profile));
      notify('Профиль сохранен', 'success');
    } catch (err) {
      setErrors(getFieldErrors(err));
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setBusy('password');
    setErrors({});
    try {
      await authApi.changePassword(passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      notify('Пароль изменен', 'success');
    } catch (err) {
      setErrors(getFieldErrors(err));
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="grid grid--2">
      <form className="card panel form" onSubmit={saveProfile}>
        <h3 className="panel__title">Профиль</h3>
        <Field label="Имя" error={errors.name}>
          <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
        </Field>
        <Field label="Город" error={errors.city}>
          <input value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} placeholder="Минск" />
        </Field>
        <Field label="Email" hint="Email изменить нельзя"><input value={user.email} disabled /></Field>
        <div className="panel__footer">
          <button type="submit" className="btn btn--primary" disabled={busy === 'profile'}>Сохранить</button>
        </div>
      </form>
      <form className="card panel form" onSubmit={savePassword}>
        <h3 className="panel__title">Смена пароля</h3>
        <Field label="Текущий пароль" error={errors.currentPassword}>
          <input type="password" value={passwords.currentPassword} autoComplete="current-password"
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} />
        </Field>
        <Field label="Новый пароль" error={errors.newPassword} hint="Не короче 8 символов, буква и цифра">
          <input type="password" value={passwords.newPassword} autoComplete="new-password"
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} />
        </Field>
        <div className="panel__footer">
          <button type="submit" className="btn btn--primary" disabled={busy === 'password' || !passwords.currentPassword || !passwords.newPassword}>
            Изменить пароль
          </button>
        </div>
      </form>
    </div>
  );
}

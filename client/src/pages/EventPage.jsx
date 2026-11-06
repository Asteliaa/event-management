import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, CalendarPlus, CalendarDays, Clock, Heart, Link2, MapPin, Minus, Pencil, Plus, Ticket, User, Video,
} from 'lucide-react';
import { useFetch } from '../hooks/useFetch.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { authApi, eventsApi, registrationsApi } from '../api/index.js';
import { getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';
import EventCover from '../components/events/EventCover.jsx';
import EventCard, { SeatsBar } from '../components/events/EventCard.jsx';
import EventChat from '../components/events/EventChat.jsx';
import ReminderPanel from '../components/events/ReminderPanel.jsx';
import { ConfirmDialog, ErrorState, Spinner } from '../components/ui/index.jsx';
import { TYPE_LABELS, formatDate, formatTime, placeOf, plural, timeUntil } from '../utils/format.js';

function RegistrationPanel({ event, onChange }) {
  const { isAuthenticated } = useAuth();
  const { notify } = useNotifications();
  const location = useLocation();
  const [tickets, setTickets] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const reg = event.myRegistration;
  const maxTickets = Math.min(10, event.seatsLeft ?? 10);

  async function register() {
    setBusy(true);
    try {
      const { autoReminder, ...registration } = await eventsApi.register(event.id, { tickets });
      onChange((e) => ({
        ...e,
        myRegistration: registration,
        seatsTaken: e.seatsTaken + tickets,
        seatsLeft: e.capacity ? e.seatsLeft - tickets : null,
        myReminders: autoReminder ? [...e.myReminders.filter((r) => r.id !== autoReminder.id), autoReminder] : e.myReminders,
      }));
      notify('Вы зарегистрированы! Мы напомним о начале.', 'success');
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changeTickets(delta) {
    const next = reg.tickets + delta;
    setBusy(true);
    try {
      const updated = await registrationsApi.update(reg.id, { tickets: next });
      onChange((e) => ({
        ...e,
        myRegistration: { ...e.myRegistration, tickets: updated.tickets },
        seatsTaken: e.seatsTaken + delta,
        seatsLeft: e.capacity ? e.seatsLeft - delta : null,
      }));
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await registrationsApi.cancel(reg.id);
      onChange((e) => ({
        ...e,
        myRegistration: null,
        seatsTaken: e.seatsTaken - reg.tickets,
        seatsLeft: e.capacity ? e.seatsLeft + reg.tickets : null,
        myReminders: e.myReminders.filter((r) => r.status === 'sent'),
      }));
      notify('Регистрация отменена', 'info');
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  let body;
  if (event.status === 'cancelled') body = <p className="notice notice--danger">Мероприятие отменено организатором.</p>;
  else if (event.isPast) body = <p className="notice">Мероприятие уже прошло.{reg && ' Спасибо за участие!'}</p>;
  else if (!isAuthenticated) {
    body = (
      <>
        <p className="muted">Войдите, чтобы зарегистрироваться и получать напоминания.</p>
        <Link to="/login" state={{ from: location }} className="btn btn--primary btn--block">Войти и зарегистрироваться</Link>
      </>
    );
  } else if (reg) {
    body = (
      <>
        <p className="notice notice--success"><Ticket size={16} /> Вы зарегистрированы</p>
        <div className="tickets">
          <span>Билетов:</span>
          <button type="button" className="icon-btn icon-btn--sm" disabled={busy || reg.tickets <= 1} onClick={() => changeTickets(-1)} aria-label="Меньше"><Minus size={16} /></button>
          <b>{reg.tickets}</b>
          <button type="button" className="icon-btn icon-btn--sm" disabled={busy || reg.tickets >= 10 || event.seatsLeft === 0} onClick={() => changeTickets(1)} aria-label="Больше"><Plus size={16} /></button>
        </div>
        <button type="button" className="btn btn--ghost btn--block" onClick={() => setConfirm(true)} disabled={busy}>Отменить регистрацию</button>
      </>
    );
  } else if (event.seatsLeft === 0) body = <p className="notice notice--danger">Все места заняты.</p>;
  else {
    body = (
      <>
        <div className="tickets">
          <span>Билетов:</span>
          <button type="button" className="icon-btn icon-btn--sm" disabled={tickets <= 1} onClick={() => setTickets((t) => t - 1)} aria-label="Меньше"><Minus size={16} /></button>
          <b>{tickets}</b>
          <button type="button" className="icon-btn icon-btn--sm" disabled={tickets >= maxTickets} onClick={() => setTickets((t) => t + 1)} aria-label="Больше"><Plus size={16} /></button>
        </div>
        <button type="button" className="btn btn--primary btn--block btn--lg" onClick={register} disabled={busy}>
          <Ticket size={18} /> {busy ? 'Регистрируем…' : 'Зарегистрироваться'}
        </button>
      </>
    );
  }

  return (
    <section className="card panel panel--sticky">
      <div className="panel__countdown">{event.isPast ? 'Завершено' : `Начало ${timeUntil(event.startsAt)}`}</div>
      <SeatsBar event={event} />
      {body}
      {confirm && (
        <ConfirmDialog
          title="Отменить регистрацию?"
          text="Места освободятся для других участников, напоминания будут удалены."
          confirmLabel="Отменить регистрацию"
          danger
          busy={busy}
          onConfirm={cancel}
          onCancel={() => setConfirm(false)}
        />
      )}
    </section>
  );
}

export default function EventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, user } = useAuth();
  const { notify } = useNotifications();
  const { data: event, loading, error, reload, setData } = useFetch((signal) => eventsApi.get(id, signal), [id, user?.id]);
  const { data: similar } = useFetch(() => eventsApi.similar(id), [id]);
  useDocumentTitle(event?.title || 'Мероприятие');

  async function toggleFavorite() {
    const next = !event.isFavorite;
    setData((e) => ({ ...e, isFavorite: next }));    // оптимистичное обновление
    try {
      await (next ? authApi.addFavorite(id) : authApi.removeFavorite(id));
      notify(next ? 'Добавлено в избранное' : 'Удалено из избранного', 'success', { duration: 2500 });
    } catch (err) {
      setData((e) => ({ ...e, isFavorite: !next }));
      notify(getErrorMessage(err), 'error');
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify('Ссылка скопирована', 'success', { duration: 2500 });
    } catch {
      notify('Не удалось скопировать ссылку', 'error');
    }
  }

  if (loading && !event) return <div className="container page"><Spinner /></div>;
  if (error) return <div className="container page"><ErrorState message={error} onRetry={reload} /></div>;

  const canChat = isAuthenticated && (event.myRegistration || isAdmin);

  return (
    <div className="event-page">
      <div className="container">
        <button type="button" className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Назад</button>
      </div>
      <div className="container event-page__hero">
        <EventCover event={event} size="hero" />
      </div>

      <div className="container event-page__layout">
        <article className="event-page__main">
          <div className="event-card__tags">
            <span className={`chip chip--${event.type}`}>{TYPE_LABELS[event.type]}</span>
            {event.category && <span className="chip chip--category" style={{ '--chip': event.category.color }}>{event.category.name}</span>}
            {event.status === 'cancelled' && <span className="chip chip--danger">Отменено</span>}
          </div>
          <h1 className="event-page__title">{event.title}</h1>

          <div className="event-page__actions">
            {isAuthenticated && (
              <button type="button" className={`btn btn--ghost ${event.isFavorite ? 'is-favorite' : ''}`} onClick={toggleFavorite}>
                <Heart size={16} fill={event.isFavorite ? 'currentColor' : 'none'} /> {event.isFavorite ? 'В избранном' : 'В избранное'}
              </button>
            )}
            <a className="btn btn--ghost" href={eventsApi.calendarUrl(event.id)}><CalendarPlus size={16} /> В календарь</a>
            <button type="button" className="btn btn--ghost" onClick={copyLink}><Link2 size={16} /> Поделиться</button>
            {isAdmin && <Link className="btn btn--ghost" to={`/admin/events/${event.id}/edit`}><Pencil size={16} /> Редактировать</Link>}
          </div>

          <ul className="facts">
            <li><CalendarDays size={20} /><div><b>{formatDate(event.startsAt)}</b><span>Дата</span></div></li>
            <li><Clock size={20} /><div><b>{formatTime(event.startsAt)}{event.endsAt && ` – ${formatTime(event.endsAt)}`}</b><span>Время (местное)</span></div></li>
            <li>{event.location?.online ? <Video size={20} /> : <MapPin size={20} />}<div><b>{placeOf(event)}</b><span>Место</span></div></li>
            <li><User size={20} /><div><b>{event.organizer?.name || 'EventHub'}</b><span>Организатор</span></div></li>
          </ul>

          <section className="prose">
            <h2>О мероприятии</h2>
            {(event.description || 'Описание появится позже.').split('\n').map((p, i) => <p key={i}>{p}</p>)}
            {event.location?.online && event.location.url && event.myRegistration && (
              <p className="notice"><Video size={16} /> Ссылка на трансляцию: <a href={event.location.url} target="_blank" rel="noreferrer">{event.location.url}</a></p>
            )}
          </section>

          {event.tags?.length > 0 && (
            <div className="tags">
              {event.tags.map((t) => <Link key={t} to={`/events?search=${encodeURIComponent(t)}`} className="tag">#{t}</Link>)}
            </div>
          )}

          {canChat && <EventChat eventId={event.id} />}
          {isAuthenticated && !canChat && !event.isPast && (
            <p className="muted">Чат участников доступен после регистрации.</p>
          )}
        </article>

        <aside className="event-page__aside">
          <RegistrationPanel event={event} onChange={setData} />
          {isAuthenticated && (
            <ReminderPanel
              event={event}
              reminders={event.myReminders || []}
              onChange={(myReminders) => setData((e) => ({ ...e, myReminders }))}
            />
          )}
          {event.capacity && (
            <p className="muted small center">
              Занято {event.seatsTaken} из {event.capacity} {plural(event.capacity, ['места', 'мест', 'мест'])}
            </p>
          )}
        </aside>
      </div>

      {similar?.length > 0 && (
        <section className="section container">
          <h2>Похожие мероприятия</h2>
          <div className="grid grid--cards">{similar.map((e) => <EventCard key={e.id} event={e} />)}</div>
        </section>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, CalendarPlus, Heart, Link2, MapPin, Minus, Pencil, Plus, Ticket, User, Video,
} from 'lucide-react';
import { useFetch } from '../hooks/useFetch.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { authApi, eventsApi, registrationsApi } from '../api/index.js';
import { getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';
import EventCover from '../components/events/EventCover.jsx';
import EventRow, { CategoryMark, DateBlock, SeatsBar } from '../components/events/EventCard.jsx';
import EventChat from '../components/events/EventChat.jsx';
import ReminderPanel from '../components/events/ReminderPanel.jsx';
import { ConfirmDialog, ErrorState, Spinner } from '../components/ui/index.jsx';
import { TYPE_LABELS, formatDate, formatTime, placeOf, timeUntil } from '../utils/format.js';

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
          {busy ? 'Регистрируем…' : 'Зарегистрироваться'}
        </button>
      </>
    );
  }

  return (
    <section className="ticket">
      <div className="ticket__top">
        <p className="ticket__countdown">{event.isPast ? 'Мероприятие завершено' : `Начнется ${timeUntil(event.startsAt)}`}</p>
        <SeatsBar event={event} />
      </div>
      <div className="ticket__stub">{body}</div>
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
    <div className="event-page container">
      <button type="button" className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Назад</button>

      <header className="event-head">
        <DateBlock date={event.startsAt} size="lg" />
        <div className="event-head__text">
          <p className="event-row__kicker">
            <span className={`type type--${event.type}`}>{TYPE_LABELS[event.type]}</span>
            <CategoryMark category={event.category} />
            {event.status === 'cancelled' && <span className="flag flag--danger">Отменено</span>}
          </p>
          <h1 className="event-head__title">{event.title}</h1>
          <p className="event-head__when">
            {formatDate(event.startsAt)}, {formatTime(event.startsAt)}{event.endsAt && `–${formatTime(event.endsAt)}`}
          </p>
        </div>
      </header>

      <div className="event-page__layout">
        <article className="event-page__main">
          <EventCover event={event} />

          <div className="event-page__actions">
            {isAuthenticated && (
              <button type="button" className={`btn btn--quiet ${event.isFavorite ? 'is-favorite' : ''}`} onClick={toggleFavorite} aria-pressed={event.isFavorite}>
                <Heart size={16} fill={event.isFavorite ? 'currentColor' : 'none'} /> {event.isFavorite ? 'В избранном' : 'В избранное'}
              </button>
            )}
            <a className="btn btn--quiet" href={eventsApi.calendarUrl(event.id)}><CalendarPlus size={16} /> Добавить в календарь</a>
            <button type="button" className="btn btn--quiet" onClick={copyLink}><Link2 size={16} /> Скопировать ссылку</button>
            {isAdmin && <Link className="btn btn--quiet" to={`/admin/events/${event.id}/edit`}><Pencil size={16} /> Редактировать</Link>}
          </div>

          <dl className="facts">
            <div>
              <dt>{event.location?.online ? <Video size={16} /> : <MapPin size={16} />} Где</dt>
              <dd>{placeOf(event)}</dd>
            </div>
            <div>
              <dt><User size={16} /> Организатор</dt>
              <dd>{event.organizer?.name || 'EventHub'}</dd>
            </div>
          </dl>

          <section className="prose">
            <h2>О мероприятии</h2>
            {(event.description || 'Организатор пока не добавил описание.').split('\n').map((p, i) => <p key={i}>{p}</p>)}
            {event.location?.online && event.location.url && event.myRegistration && (
              <p className="notice"><Video size={16} /> Трансляция: <a href={event.location.url} target="_blank" rel="noreferrer">{event.location.url}</a></p>
            )}
          </section>

          {event.tags?.length > 0 && (
            <div className="tags">
              {event.tags.map((t) => <Link key={t} to={`/events?search=${encodeURIComponent(t)}`} className="tag">#{t}</Link>)}
            </div>
          )}

          {canChat && <EventChat eventId={event.id} />}
          {isAuthenticated && !canChat && !event.isPast && (
            <p className="muted">Чат участников откроется после регистрации.</p>
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
        </aside>
      </div>

      {similar?.length > 0 && (
        <section className="section">
          <h2>Похожие мероприятия</h2>
          <div className="agenda">{similar.map((e) => <EventRow key={e.id} event={e} />)}</div>
        </section>
      )}
    </div>
  );
}

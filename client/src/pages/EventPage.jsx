import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, CalendarDays, CalendarPlus, Heart, Link2, Lock, MapPin, Pencil, Ticket, User, Video,
} from 'lucide-react';
import { useFetch } from '../hooks/useFetch.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { authApi, eventsApi, registrationsApi } from '../api/index.js';
import { getErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import EventCover from '../components/events/EventCover.jsx';
import EventRow, { CategoryMark, DateBlock, SeatsBar } from '../components/events/EventCard.jsx';
import EventChat from '../components/events/EventChat.jsx';
import ReminderPanel from '../components/events/ReminderPanel.jsx';
import { ConfirmDialog, ErrorState, Field, Modal, Spinner } from '../components/ui/index.jsx';
import {
  EVENT_STATUS_LABELS, PHASE_LABELS, TYPE_LABELS, formatDate, formatDateTime, formatTime, placeOf, sameOffset, timeUntil,
} from '../utils/format.js';

function RegistrationPanel({ event, onChange, onReload }) {
  const { isAuthenticated } = useAuth();
  const { notify } = useNotifications();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const reg = event.myRegistration;

  async function register() {
    setBusy(true);
    try {
      // одна регистрация – одно место
      const { autoReminder, ...registration } = await eventsApi.register(event.id, {});
      onChange((e) => ({
        ...e,
        myRegistration: registration,
        seatsTaken: e.seatsTaken + 1,
        seatsLeft: e.capacity ? e.seatsLeft - 1 : null,
        myReminders: autoReminder ? [...e.myReminders.filter((r) => r.id !== autoReminder.id), autoReminder] : e.myReminders,
      }));
      notify('Вы зарегистрированы! Мы напомним о начале.', 'success');
      // карточка запрашивается заново: участнику открывается ссылка подключения
      onReload();
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
        seatsTaken: e.seatsTaken - 1,
        seatsLeft: e.capacity ? e.seatsLeft + 1 : null,
        myReminders: e.myReminders.filter((r) => r.status === 'sent'),
      }));
      notify('Регистрация отменена', 'info');
      onReload();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  // Состояния: публикация (черновик / отменено), фаза (идет / завершено), доступность записи (закрыта / срок / мест нет)
  const deadlinePassed = event.registrationDeadline && new Date(event.registrationDeadline) <= new Date();
  let body;
  if (event.status === 'draft') body = <p className="notice">Черновик: регистрация откроется после публикации.</p>;
  else if (event.status === 'cancelled') {
    body = <p className="notice notice--danger">Мероприятие отменено.{event.cancelReason && ` Причина: ${event.cancelReason}`}</p>;
  } else if (event.phase === 'finished') body = <p className="notice">Мероприятие завершено.{reg && ' Спасибо за участие!'}</p>;
  else if (event.phase === 'live') body = <p className="notice notice--success">Мероприятие идет сейчас.{reg ? ' Вы зарегистрированы.' : ' Регистрация закрыта.'}</p>;
  else if (!isAuthenticated) {
    body = (
      <>
        <p className="muted small">Войдите, чтобы зарегистрироваться и получать напоминания.</p>
        <Link to="/login" state={{ from: location }} className="btn btn--primary btn--block btn--lg">Войти и зарегистрироваться</Link>
      </>
    );
  } else if (reg) {
    body = (
      <>
        <p className="notice notice--success"><Ticket size={16} /> Вы зарегистрированы</p>
        <button type="button" className="btn btn--ghost btn--block" onClick={() => setConfirm(true)} disabled={busy}>Отменить регистрацию</button>
      </>
    );
  } else if (!event.registrationOpen) body = <p className="notice">Регистрация закрыта организатором.</p>;
  else if (deadlinePassed) body = <p className="notice">Срок регистрации истек.</p>;
  else if (event.seatsLeft === 0) body = <p className="notice notice--danger">Все места заняты.</p>;
  else {
    body = (
      <>
        <p className="muted small">
          Одна регистрация – одно место.
          {event.registrationDeadline && ` Регистрация до ${formatDateTime(event.registrationDeadline, event.timezone)}.`}
        </p>
        <button type="button" className="btn btn--primary btn--block btn--lg" onClick={register} disabled={busy}>
          {busy ? 'Регистрируем…' : 'Зарегистрироваться'}
        </button>
      </>
    );
  }

  return (
    <section className="card ticket">
      <div className="ticket__top">
        <p className="ticket__label">Регистрация</p>
        <p className="ticket__countdown">
          {event.status === 'cancelled' ? 'Отменено' : !event.startsAt ? 'Дата не назначена'
            : event.phase === 'upcoming' ? `Начнется ${timeUntil(event.startsAt)}` : PHASE_LABELS[event.phase]}
        </p>
        <SeatsBar event={event} />
      </div>
      <div className="ticket__stub">{body}</div>
      {confirm && (
        <ConfirmDialog
          title="Отменить регистрацию?"
          text="Место освободится для других участников, напоминания будут отменены. Записаться снова можно, пока регистрация открыта и есть места."
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

// Действия организатора-владельца и администратора с состоянием мероприятия (права проверяет сервер)
function ManagePanel({ event, onChange }) {
  const { isAdmin } = useAuth();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');

  async function run(action, message) {
    setBusy(true);
    try {
      if (action === 'remove') {
        await eventsApi.remove(event.id);
        notify(message, 'success');
        navigate(isAdmin ? '/admin/events' : '/organizer');
        return;
      }
      const updated = action === 'cancel' ? await eventsApi.cancel(event.id, reason) : await eventsApi[action](event.id);
      onChange((e) => ({ ...e, ...updated }));
      notify(message, 'success');
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  return (
    <section className="card panel stack">
      <p className="ticket__label">Управление</p>
      <p>Статус: <b>{EVENT_STATUS_LABELS[event.status]}</b>{event.phase && event.status === 'published' && `, ${PHASE_LABELS[event.phase].toLowerCase()}`}</p>
      {event.status === 'draft' && (
        <>
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => run('publish', 'Мероприятие опубликовано')}>Опубликовать</button>
          <button type="button" className="btn btn--ghost btn--block" disabled={busy} onClick={() => setDialog('remove')}>Удалить черновик</button>
        </>
      )}
      {event.status === 'published' && (
        <>
          {event.seatsTaken === 0 && (
            <button type="button" className="btn btn--soft btn--block" disabled={busy} onClick={() => run('unpublish', 'Мероприятие снято с публикации')}>Снять с публикации</button>
          )}
          {event.phase !== 'finished' && (
            <button type="button" className="btn btn--ghost btn--block" disabled={busy} onClick={() => setDialog('cancel')}>Отменить мероприятие</button>
          )}
        </>
      )}
      {dialog === 'cancel' && (
        <Modal
          title="Отменить мероприятие?"
          onClose={() => setDialog(null)}
          footer={(
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setDialog(null)}>Не отменять</button>
              <button type="button" className="btn btn--danger" disabled={busy} onClick={() => run('cancel', 'Мероприятие отменено')}>Отменить мероприятие</button>
            </>
          )}
        >
          <p>Участники получат уведомление, напоминания будут отменены. История регистраций и чат сохранятся. Отмену нельзя вернуть.</p>
          <Field label="Причина (увидят участники)"><textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
      {dialog === 'remove' && (
        <ConfirmDialog
          title="Удалить черновик?"
          text={`«${event.title}» будет удален. Действие нельзя отменить.`}
          confirmLabel="Удалить"
          danger
          busy={busy}
          onConfirm={() => run('remove', 'Черновик удален')}
          onCancel={() => setDialog(null)}
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
  const { socket } = useSocket();

  // Изменения мероприятия в реальном времени: перенос, отмена, снятие с публикации, места, отмена участия.
  // В событиях нет персональных данных и ссылки подключения, поэтому карточка запрашивается заново
  useEffect(() => {
    if (!socket) return undefined;
    const same = (eventId) => String(eventId) === String(id);
    const handlers = {
      'event:updated': ({ event: e }) => same(e.id) && reload(),
      'event:deleted': ({ id: eventId }) => same(eventId) && reload(),
      'registration:created': ({ eventId }) => same(eventId) && reload(),
      'registration:cancelled': ({ eventId }) => same(eventId) && reload(),
      'chat:revoked': ({ eventId }) => same(eventId) && reload(),
    };
    Object.entries(handlers).forEach(([name, fn]) => socket.on(name, fn));
    return () => Object.entries(handlers).forEach(([name, fn]) => socket.off(name, fn));
  }, [socket, id, reload]);
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

  // признак рассчитывает сервер (администратор или организатор-владелец); права действий проверяются там же
  const { canManage } = event;
  const tz = event.timezone;
  const canChat = isAuthenticated && (event.myRegistration || canManage);

  return (
    <div className="event-page container">
      <button type="button" className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Назад</button>

      <header className="event-head card">
        <DateBlock date={event.startsAt} tz={tz} size="lg" />
        <div className="event-head__text">
          <p className="event-row__kicker">
            <span className={`type type--${event.type}`}>{TYPE_LABELS[event.type]}</span>
            <CategoryMark category={event.category} />
            {event.status === 'cancelled' && <span className="flag flag--danger">Отменено</span>}
            {event.status === 'draft' && <span className="flag">Черновик</span>}
            {event.status === 'published' && event.phase === 'live' && <span className="flag">Идет сейчас</span>}
          </p>
          <h1 className="event-head__title">{event.title}</h1>
          <ul className="event-meta">
            <li>
              <CalendarDays size={16} />
              {event.startsAt ? (
                <span>
                  {formatDate(event.startsAt, tz)}, {formatTime(event.startsAt, tz)}{event.endsAt && `–${formatTime(event.endsAt, tz)}`}
                  <small className="muted"> ({tz})</small>
                  {!sameOffset(event.startsAt, tz) && <small className="muted"> · по вашему времени {formatDateTime(event.startsAt)}</small>}
                </span>
              ) : <span>Дата не назначена</span>}
            </li>
            <li>{event.location?.online ? <Video size={16} /> : <MapPin size={16} />}<span>{placeOf(event)}</span></li>
            <li><User size={16} /><span>{event.organizer?.name || 'EventHub'}</span></li>
          </ul>
        </div>
      </header>

      <div className="event-page__layout">
        <article className="event-page__main">
          <EventCover event={event} />

          <div className="event-page__actions">
            {isAuthenticated && (
              <button type="button" className={`btn btn--secondary btn--sm ${event.isFavorite ? 'is-favorite' : ''}`} onClick={toggleFavorite} aria-pressed={event.isFavorite}>
                <Heart size={16} fill={event.isFavorite ? 'currentColor' : 'none'} /> {event.isFavorite ? 'В избранном' : 'В избранное'}
              </button>
            )}
            <a className="btn btn--secondary btn--sm" href={eventsApi.calendarUrl(event.id)}><CalendarPlus size={16} /> В календарь (.ics)</a>
            <button type="button" className="btn btn--secondary btn--sm" onClick={copyLink}><Link2 size={16} /> Скопировать ссылку</button>
            {canManage && <Link className="btn btn--secondary btn--sm" to={isAdmin ? `/admin/events/${event.id}/edit` : `/organizer/events/${event.id}/edit`}><Pencil size={16} /> Редактировать</Link>}
          </div>

          <section className="card prose">
            <h2>О мероприятии</h2>
            {(event.description || 'Организатор пока не добавил описание.').split('\n').map((p, i) => <p key={i}>{p}</p>)}
            {event.location?.online && event.location.url && (event.myRegistration || canManage) && (
              <p className="notice"><Video size={16} /> Трансляция: <a href={event.location.url} target="_blank" rel="noreferrer">{event.location.url}</a></p>
            )}
            {event.tags?.length > 0 && (
              <div className="tags">
                {event.tags.map((t) => <Link key={t} to={`/events?search=${encodeURIComponent(t)}`} className="tag">#{t}</Link>)}
              </div>
            )}
          </section>

          {canChat && <EventChat eventId={event.id} />}
          {isAuthenticated && !canChat && event.phase !== 'finished' && event.status !== 'draft' && (
            <p className="card hint-box"><Lock size={18} /> Чат участников откроется после регистрации.</p>
          )}
        </article>

        <aside className="event-page__aside">
          {canManage && <ManagePanel event={event} onChange={setData} />}
          <RegistrationPanel event={event} onChange={setData} onReload={reload} />
          {isAuthenticated && event.myRegistration && event.status === 'published' && (
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
          <div className="section__head"><h2>Похожие мероприятия</h2></div>
          <div className="agenda">{similar.map((e) => <EventRow key={e.id} event={e} />)}</div>
        </section>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { formatDateTime } from '../../utils/format.js';

// Центр уведомлений: отправленные напоминания с отметкой «прочитано»
export default function NotificationBell() {
  const { inbox, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={`Уведомления: ${unreadCount} новых`}>
        <Bell size={20} />
        {unreadCount > 0 && <span className="badge-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="dropdown__panel notif">
          <div className="notif__head">
            <strong>Напоминания</strong>
            {unreadCount > 0 && (
              <button type="button" className="link-btn" onClick={markAllRead}><CheckCheck size={14} /> Прочитать все</button>
            )}
          </div>
          {inbox.length === 0 ? (
            <div className="notif__empty"><BellOff size={28} /><p>Пока нет напоминаний</p></div>
          ) : (
            <ul className="notif__list">
              {inbox.slice(0, 8).map((r) => (
                <li key={r.id} className={r.readAt ? '' : 'is-unread'}>
                  <Link to={`/events/${r.event?.id}`} onClick={() => { markRead(r.id); setOpen(false); }}>
                    <span className="notif__title">{r.event?.title || 'Мероприятие удалено'}</span>
                    <span className="notif__meta">
                      Начало {r.event && formatDateTime(r.event.startsAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/profile/reminders" className="notif__all" onClick={() => setOpen(false)}>Все напоминания</Link>
        </div>
      )}
    </div>
  );
}

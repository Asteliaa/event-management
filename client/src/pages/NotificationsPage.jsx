import { useState } from 'react';
import { Link } from 'react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { useFetch } from '../hooks/useFetch.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { notificationsApi } from '../api/index.js';
import { getErrorMessage } from '../api/client.js';
import { useNotifications } from '../context/NotificationContext.jsx';
import { EmptyState, ErrorState, Pagination, Spinner } from '../components/ui/index.jsx';
import { formatDateTime } from '../utils/format.js';
import { notificationText } from '../utils/notifications.js';

// История уведомлений: хранится на сервере, поэтому доступна и после того, как пользователь был не в сети
export default function NotificationsPage() {
  useDocumentTitle('Уведомления');
  const { notify, markRead, markAllRead } = useNotifications();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, loading, error, reload, setData } = useFetch(
    () => notificationsApi.list({ page, limit: 20, unread: unreadOnly || undefined }),
    [page, unreadOnly],
  );

  function read(n) {
    if (n.readAt) return;
    markRead(n.id);
    setData((d) => ({ ...d, data: d.data.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) }));
  }

  async function readAll() {
    try {
      markAllRead();
      reload();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  }

  return (
    <div className="container page stack">
      <div className="page__head page__head--row">
        <h1>Уведомления</h1>
        {data?.meta.unread > 0 && <button type="button" className="btn btn--soft" onClick={readAll}><CheckCheck size={16} /> Прочитать все</button>}
      </div>
      <div className="segmented">
        <button type="button" className={!unreadOnly ? 'is-active' : ''} onClick={() => { setUnreadOnly(false); setPage(1); }}>Все</button>
        <button type="button" className={unreadOnly ? 'is-active' : ''} onClick={() => { setUnreadOnly(true); setPage(1); }}>
          Непрочитанные{data ? ` (${data.meta.unread})` : ''}
        </button>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data?.data.length === 0 && <EmptyState icon={Bell} title="Уведомлений нет" text="Здесь появятся напоминания и изменения мероприятий, на которые вы записаны." />}
      {data?.data.length > 0 && (
        <ul className="card reminders">
          {data.data.map((n) => (
            <li key={n.id} className={`reminder ${n.readAt ? '' : 'is-unread'}`}>
              <span className="reminder__icon"><Bell size={16} /></span>
              <span className="reminder__text">
                {n.event ? <Link to={`/events/${n.event.id}`} onClick={() => read(n)}><b>{notificationText(n)}</b></Link> : <b>{notificationText(n)}</b>}
                <small>{formatDateTime(n.createdAt)}</small>
              </span>
              {!n.readAt && <button type="button" className="link-btn" onClick={() => read(n)}>Прочитано</button>}
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={setPage} />}
    </div>
  );
}

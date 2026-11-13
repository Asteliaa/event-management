import { useState } from 'react';
import { Link } from 'react-router';
import { Eye, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { eventsApi } from '../../api/index.js';
import { getErrorMessage } from '../../api/client.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { ConfirmDialog, ErrorState, Pagination, Spinner } from '../../components/ui/index.jsx';
import ParticipantsModal from '../../components/events/ParticipantsModal.jsx';
import { EVENT_STATUS_LABELS, TYPE_LABELS, formatShort, formatTime } from '../../utils/format.js';

export default function AdminEvents() {
  useDocumentTitle('Мероприятия');
  const { notify } = useNotifications();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);
  const [toDelete, setToDelete] = useState(null);
  const [participants, setParticipants] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useFetch(
    // все мероприятия, включая черновики и отмененные (каталог показывает только опубликованные)
    (signal) => eventsApi.managed({ all: true, search: debounced || undefined, status: status || undefined, page, limit: 10 }, signal),
    [debounced, status, page],
  );

  async function remove() {
    setBusy(true);
    try {
      await eventsApi.remove(toDelete.id);
      notify(`Мероприятие «${toDelete.title}» удалено`, 'success');
      setToDelete(null);
      reload();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="page__head page__head--row">
        <h1>Мероприятия</h1>
        <Link to="/admin/events/new" className="btn btn--primary"><Plus size={16} /> Создать</Link>
      </div>
      <div className="toolbar">
        <div className="filters__search"><Search size={18} />
          <input type="search" placeholder="Поиск" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Поиск" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Статус">
          <option value="">Все статусы</option>
          {Object.entries(EVENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <div className="card table-wrap">
          <table className="table table--hover">
            <thead><tr><th>Название</th><th className="hide-mobile">Формат</th><th className="hide-mobile">Дата</th><th className="hide-mobile">Места</th><th aria-label="Действия" /></tr></thead>
            <tbody>
              {data.data.map((e) => (
                <tr key={e.id} className={e.status === 'cancelled' ? 'is-muted' : ''}>
                  <td>
                    <b>{e.title}</b>
                    <small className="muted">{EVENT_STATUS_LABELS[e.status]}{e.organizer?.name ? `, ${e.organizer.name}` : ''}</small>
                    <small className="muted only-mobile">{TYPE_LABELS[e.type]}, {e.startsAt ? `${formatShort(e.startsAt, e.timezone)}, ${formatTime(e.startsAt, e.timezone)}` : 'без даты'}, мест {e.seatsTaken}{e.capacity ? ` / ${e.capacity}` : ''}</small>
                  </td>
                  <td className="hide-mobile">{TYPE_LABELS[e.type]}</td>
                  <td className="hide-mobile nowrap">{e.startsAt ? `${formatShort(e.startsAt, e.timezone)}, ${formatTime(e.startsAt, e.timezone)}` : '—'}</td>
                  <td className="hide-mobile nowrap">{e.seatsTaken}{e.capacity ? ` / ${e.capacity}` : ''}</td>
                  <td className="table__actions">
                    <Link to={`/events/${e.id}`} className="icon-btn icon-btn--sm" title="Открыть"><Eye size={16} /></Link>
                    <button type="button" className="icon-btn icon-btn--sm" title="Участники" onClick={() => setParticipants(e)}><Users size={16} /></button>
                    <Link to={`/admin/events/${e.id}/edit`} className="icon-btn icon-btn--sm" title="Редактировать"><Pencil size={16} /></Link>
                    {e.status === 'draft' && <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" title="Удалить черновик" onClick={() => setToDelete(e)}><Trash2 size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.data.length === 0 && <p className="table-empty">Ничего не найдено</p>}
        </div>
      )}
      {data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={setPage} />}
      {toDelete && (
        <ConfirmDialog
          title="Удалить черновик?"
          text={`«${toDelete.title}» будет удален. Опубликованные мероприятия не удаляются – их отменяют на странице мероприятия.`}
          confirmLabel="Удалить"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setToDelete(null)}
        />
      )}
      {participants && <ParticipantsModal event={participants} onClose={() => setParticipants(null)} />}
    </div>
  );
}

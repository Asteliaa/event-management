import { useState } from 'react';
import { Link } from 'react-router';
import { Download, Eye, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { eventsApi, registrationsApi } from '../../api/index.js';
import { getErrorMessage } from '../../api/client.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { ConfirmDialog, ErrorState, Modal, Pagination, Spinner } from '../../components/ui/index.jsx';
import { STATUS_LABELS, TYPE_LABELS, downloadBlob, formatDateTime } from '../../utils/format.js';

function ParticipantsModal({ event, onClose }) {
  const { notify } = useNotifications();
  const { data, loading, error, setData } = useFetch(() => eventsApi.participants(event.id), [event.id]);

  async function exportCsv() {
    try {
      downloadBlob(await eventsApi.participantsCsv(event.id), `participants-${event.id}.csv`);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  }

  async function setStatus(reg, status) {
    try {
      const updated = await registrationsApi.update(reg.id, { status });
      setData((list) => list.map((r) => (r.id === reg.id ? { ...r, status: updated.status } : r)));
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  }

  return (
    <Modal
      title={`Участники: ${event.title}`}
      onClose={onClose}
      footer={<button type="button" className="btn btn--soft" onClick={exportCsv} disabled={!data?.length}><Download size={16} /> Выгрузить CSV</button>}
    >
      {loading && <Spinner />}
      {error && <ErrorState message={error} />}
      {data?.length === 0 && <p className="muted">Регистраций пока нет.</p>}
      {data?.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Участник</th><th>Билетов</th><th>Статус</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{r.user?.name}<br /><small className="muted">{r.user?.email}</small></td>
                  <td>{r.tickets}</td>
                  <td>
                    {r.status === 'cancelled' ? STATUS_LABELS.cancelled : (
                      <select value={r.status} onChange={(e) => setStatus(r, e.target.value)} aria-label="Статус">
                        <option value="registered">{STATUS_LABELS.registered}</option>
                        <option value="attended">{STATUS_LABELS.attended}</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function AdminEvents() {
  useDocumentTitle('Мероприятия');
  const { notify } = useNotifications();
  const [search, setSearch] = useState('');
  const [when, setWhen] = useState('all');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);
  const [toDelete, setToDelete] = useState(null);
  const [participants, setParticipants] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useFetch(
    (signal) => eventsApi.list({ search: debounced || undefined, when, sort: '-date', page, limit: 10 }, signal),
    [debounced, when, page],
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
        <select value={when} onChange={(e) => { setWhen(e.target.value); setPage(1); }} aria-label="Период">
          <option value="all">Все</option><option value="upcoming">Предстоящие</option><option value="past">Прошедшие</option>
        </select>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <div className="card table-wrap">
          <table className="table table--hover">
            <thead><tr><th>Название</th><th>Формат</th><th>Дата</th><th>Места</th><th aria-label="Действия" /></tr></thead>
            <tbody>
              {data.data.map((e) => (
                <tr key={e.id} className={e.status === 'cancelled' ? 'is-muted' : ''}>
                  <td>
                    <b>{e.title}</b>
                    {e.category && <><br /><small style={{ color: e.category.color }}>{e.category.name}</small></>}
                  </td>
                  <td>{TYPE_LABELS[e.type]}</td>
                  <td>{formatDateTime(e.startsAt)}</td>
                  <td>{e.seatsTaken}{e.capacity ? ` / ${e.capacity}` : ''}</td>
                  <td className="table__actions">
                    <Link to={`/events/${e.id}`} className="icon-btn icon-btn--sm" title="Открыть"><Eye size={16} /></Link>
                    <button type="button" className="icon-btn icon-btn--sm" title="Участники" onClick={() => setParticipants(e)}><Users size={16} /></button>
                    <Link to={`/admin/events/${e.id}/edit`} className="icon-btn icon-btn--sm" title="Редактировать"><Pencil size={16} /></Link>
                    <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" title="Удалить" onClick={() => setToDelete(e)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.data.length === 0 && <p className="muted center">Ничего не найдено</p>}
        </div>
      )}
      {data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={setPage} />}
      {toDelete && (
        <ConfirmDialog
          title="Удалить мероприятие?"
          text={`«${toDelete.title}» будет удалено вместе с регистрациями, напоминаниями и чатом. Действие нельзя отменить.`}
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

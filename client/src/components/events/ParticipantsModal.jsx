import { Download } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { eventsApi, registrationsApi } from '../../api/index.js';
import { getErrorMessage } from '../../api/client.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { ErrorState, Modal, Spinner } from '../ui/index.jsx';
import { STATUS_LABELS, downloadBlob, formatShort } from '../../utils/format.js';

// Участники мероприятия с email: доступно организатору-владельцу и администратору (проверяет сервер).
// Отмененные регистрации остаются в списке как история
export default function ParticipantsModal({ event, onClose }) {
  const { notify } = useNotifications();
  const { data, loading, error, setData } = useFetch(() => eventsApi.participants(event.id), [event.id]);

  async function exportCsv() {
    try {
      downloadBlob(await eventsApi.participantsCsv(event.id), `participants-${event.id}.csv`);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  }

  // отметка посещения или отмена участия организатором (участник получит уведомление)
  async function setStatus(reg, status) {
    if (status === 'cancelled' && !window.confirm(`Отменить участие: ${reg.user?.name}? Участник получит уведомление.`)) return;
    try {
      const updated = status === 'cancelled'
        ? await registrationsApi.cancel(reg.id)
        : await registrationsApi.update(reg.id, { status });
      setData((list) => list.map((r) => (r.id === reg.id ? { ...r, status: updated.status, cancelledAt: updated.cancelledAt } : r)));
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
            <thead><tr><th>Участник</th><th className="hide-mobile">Дата</th><th>Статус</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{r.user?.name}<small className="muted">{r.user?.email}</small></td>
                  <td className="hide-mobile nowrap">{formatShort(r.createdAt)}{r.legacyTickets > 1 && <small className="muted">до перехода: {r.legacyTickets} бил.</small>}</td>
                  <td>
                    {r.status === 'cancelled' ? `${STATUS_LABELS.cancelled}${r.cancelledAt ? `, ${formatShort(r.cancelledAt)}` : ''}` : (
                      <select value={r.status} onChange={(e) => setStatus(r, e.target.value)} aria-label="Статус">
                        <option value="registered">{STATUS_LABELS.registered}</option>
                        <option value="attended">{STATUS_LABELS.attended}</option>
                        <option value="cancelled">Отменить участие…</option>
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

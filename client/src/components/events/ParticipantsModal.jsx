import { useState } from 'react';
import { Download } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { eventsApi, registrationsApi } from '../../api/index.js';
import { getErrorMessage } from '../../api/client.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { ErrorState, Field, Modal, Spinner } from '../ui/index.jsx';
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

  // фаза вычисляется сервером (upcoming / live / finished)
  const started = event.phase === 'live' || event.phase === 'finished';
  const cancelled = event.status === 'cancelled';
  // отмена участия: до начала и с причиной (участник получит уведомление)
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const patchRow = (updated) => setData((list) => list.map((r) => (r.id === updated.id ? { ...r, ...updated, user: r.user, event: r.event } : r)));

  async function cancelParticipant() {
    setBusy(true);
    try {
      patchRow(await registrationsApi.cancel(cancelling.id, reason.trim()));
      notify('Участие отменено, участник получит уведомление', 'info');
      setCancelling(null);
      setReason('');
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  // отметка посещения: с момента начала, ее можно исправить; места не меняются
  async function setAttended(reg, attended) {
    try {
      patchRow(await registrationsApi.update(reg.id, { attended }));
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
            <thead><tr><th>Участник</th><th className="hide-mobile">Дата</th><th>Статус</th><th>Посещение</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{r.user?.name}<small className="muted">{r.user?.email}</small></td>
                  <td className="hide-mobile nowrap">{formatShort(r.createdAt)}{r.legacyTickets > 1 && <small className="muted">до перехода: {r.legacyTickets} бил.</small>}</td>
                  <td>
                    {r.status === 'cancelled' ? (
                      <>
                        {STATUS_LABELS.cancelled}{r.cancelledAt ? `, ${formatShort(r.cancelledAt)}` : ''}
                        {r.cancelReason && <small className="muted">{r.cancelReason}</small>}
                      </>
                    ) : (
                      <>
                        {STATUS_LABELS.registered}
                        {!started && !cancelled && (
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setCancelling(r); setReason(''); }}>Отменить участие</button>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {r.status !== 'cancelled' && (
                      <label className="checkbox" title={started ? '' : 'Посещение отмечается с момента начала'}>
                        <input
                          type="checkbox"
                          checked={Boolean(r.attended)}
                          disabled={!started || cancelled}
                          onChange={(e) => setAttended(r, e.target.checked)}
                        /> Пришел
                      </label>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cancelling && (
        <div className="stack notice">
          <p>Отменить участие: <b>{cancelling.user?.name}</b>? Место освободится, участник получит уведомление с причиной.</p>
          <Field label="Причина (обязательно)">
            <textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={() => setCancelling(null)}>Не отменять</button>
            <button type="button" className="btn btn--danger" disabled={busy || reason.trim().length < 3} onClick={cancelParticipant}>Отменить участие</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

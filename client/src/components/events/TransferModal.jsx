import { useState } from 'react';
import { useFetch } from '../../hooks/useFetch.js';
import { adminApi, eventsApi } from '../../api/index.js';
import { getErrorMessage } from '../../api/client.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { ErrorState, Field, Modal, Spinner } from '../ui/index.jsx';

const ROLE_NAMES = { organizer: 'организатор', admin: 'администратор' };

// Передача мероприятия другому владельцу (только администратор): новым владельцем может быть
// активный организатор или администратор. Прежний владелец теряет доступ к управлению и чату,
// если он не участник. Нужна, например, перед снятием роли организатора
export default function TransferModal({ event, onClose, onDone }) {
  const { notify } = useNotifications();
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, error } = useFetch(async () => {
    const lists = await Promise.all(['organizer', 'admin'].map((role) => adminApi.users({ role, status: 'active', limit: 100 })));
    return lists.flatMap((l) => l.data).filter((u) => !u.blocked && u.id !== event.organizer?.id);
  }, [event.id]);

  async function transfer() {
    setBusy(true);
    try {
      const updated = await eventsApi.update(event.id, { organizer: owner });
      notify(`Мероприятие передано: ${updated.organizer?.name}`, 'success');
      onDone(updated);
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Передать мероприятие"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn--primary" disabled={!owner || busy} onClick={transfer}>Передать</button>
        </>
      )}
    >
      <p>«{event.title}». Сейчас владелец: <b>{event.organizer?.name || '—'}</b>.</p>
      <p className="muted small">Новый владелец получит управление, участников и чат. Прежний владелец потеряет доступ к управлению.</p>
      {loading && <Spinner />}
      {error && <ErrorState message={error} />}
      {data && (
        <Field label="Новый владелец" hint={data.length ? undefined : 'Нет других активных организаторов и администраторов'}>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Выберите…</option>
            {data.map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_NAMES[u.role]}, {u.email})</option>)}
          </select>
        </Field>
      )}
    </Modal>
  );
}

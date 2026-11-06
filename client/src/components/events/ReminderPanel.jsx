import { useState } from 'react';
import { BellPlus, BellRing, Check, Trash2 } from 'lucide-react';
import { remindersApi } from '../../api/index.js';
import { getErrorMessage } from '../../api/client.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { REMINDER_PRESETS, formatDateTime, formatOffset } from '../../utils/format.js';

// Напоминания пользователя о мероприятии: список, добавление по шаблону, удаление
export default function ReminderPanel({ event, reminders, onChange }) {
  const { notify } = useNotifications();
  const [offset, setOffset] = useState(60);
  const [busy, setBusy] = useState(false);

  const startsAt = new Date(event.startsAt).getTime();
  const available = REMINDER_PRESETS.filter((p) => startsAt - p.value * 60000 > Date.now()
    && !reminders.some((r) => r.offsetMinutes === p.value));
  const current = available.some((p) => p.value === Number(offset)) ? Number(offset) : available[0]?.value;

  async function add() {
    setBusy(true);
    try {
      const reminder = await remindersApi.create({ event: event.id, offsetMinutes: current });
      onChange([...reminders, reminder].sort((a, b) => b.offsetMinutes - a.offsetMinutes));
      notify(`Напомним ${formatOffset(reminder.offsetMinutes)} до начала`, 'success');
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    const prev = reminders;
    onChange(reminders.filter((r) => r.id !== id));   // оптимистичное удаление
    try {
      await remindersApi.remove(id);
    } catch (err) {
      onChange(prev);
      notify(getErrorMessage(err), 'error');
    }
  }

  if (event.isPast) return null;

  return (
    <section className="card panel">
      <h3 className="panel__title"><BellRing size={18} /> Напоминания</h3>
      {reminders.length === 0 && <p className="muted">Напоминаний пока нет.</p>}
      <ul className="reminders">
        {reminders.map((r) => (
          <li key={r.id} className={`reminder reminder--${r.status}`}>
            <span className="reminder__icon">{r.status === 'sent' ? <Check size={16} /> : <BellRing size={16} />}</span>
            <span className="reminder__text">
              <b>{formatOffset(r.offsetMinutes)}</b>
              <small>{r.status === 'sent' ? 'отправлено' : formatDateTime(r.remindAt)}{r.kind === 'auto' && ' · авто'}</small>
            </span>
            {r.status === 'pending' && (
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => remove(r.id)} aria-label="Удалить напоминание">
                <Trash2 size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {available.length > 0 && (
        <div className="reminder-add">
          <select value={current} onChange={(e) => setOffset(e.target.value)} aria-label="Когда напомнить">
            {available.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button type="button" className="btn btn--soft" onClick={add} disabled={busy}>
            <BellPlus size={16} /> Добавить
          </button>
        </div>
      )}
    </section>
  );
}

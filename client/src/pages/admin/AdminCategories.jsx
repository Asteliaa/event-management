import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { categoriesApi } from '../../api/index.js';
import { getErrorMessage } from '../../api/client.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { ConfirmDialog, ErrorState, Field, Spinner } from '../../components/ui/index.jsx';

const EMPTY = { name: '', color: '#6366f1', description: '' };

export default function AdminCategories() {
  useDocumentTitle('Категории · админ');
  const { notify } = useNotifications();
  const { data, loading, error, reload } = useFetch(() => categoriesApi.list(), []);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      if (editing) await categoriesApi.update(editing, form);
      else await categoriesApi.create(form);
      notify(editing ? 'Категория изменена' : 'Категория добавлена', 'success');
      setForm(EMPTY);
      setEditing(null);
      reload();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  }

  async function remove() {
    try {
      await categoriesApi.remove(toDelete.id);
      notify('Категория удалена', 'success');
      reload();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="stack">
      <h1>Категории</h1>
      <div className="form-layout">
        <div className="card table-wrap">
          {loading && !data && <Spinner />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {data && (
            <table className="table">
              <thead><tr><th>Категория</th><th>Предстоящих</th><th aria-label="Действия" /></tr></thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td><span className="color-dot" style={{ background: c.color }} /> <b>{c.name}</b><br /><small className="muted">{c.description}</small></td>
                    <td>{c.eventsCount}</td>
                    <td className="table__actions">
                      <button type="button" className="icon-btn icon-btn--sm" onClick={() => { setEditing(c.id); setForm({ name: c.name, color: c.color, description: c.description }); }} aria-label="Изменить"><Pencil size={16} /></button>
                      <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => setToDelete(c)} aria-label="Удалить"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form className="card panel form" onSubmit={submit}>
          <h3 className="panel__title">{editing ? 'Изменить категорию' : 'Новая категория'}</h3>
          <Field label="Название"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></Field>
          <Field label="Цвет"><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
          <Field label="Описание"><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="row">
            <button type="submit" className="btn btn--primary">{editing ? <><Pencil size={16} /> Сохранить</> : <><Plus size={16} /> Добавить</>}</button>
            {editing && <button type="button" className="btn btn--ghost" onClick={() => { setEditing(null); setForm(EMPTY); }}><X size={16} /> Отмена</button>}
          </div>
        </form>
      </div>
      {toDelete && (
        <ConfirmDialog title="Удалить категорию?" text={`Мероприятия категории «${toDelete.name}» останутся без категории.`}
          confirmLabel="Удалить" danger onConfirm={remove} onCancel={() => setToDelete(null)} />
      )}
    </div>
  );
}

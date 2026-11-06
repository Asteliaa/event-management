import { useState } from 'react';
import { Ban, Search, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { adminApi } from '../../api/index.js';
import { getErrorMessage } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { ConfirmDialog, ErrorState, Pagination, Spinner } from '../../components/ui/index.jsx';
import { formatDate } from '../../utils/format.js';

export default function AdminUsers() {
  useDocumentTitle('Пользователи');
  const { user: me } = useAuth();
  const { notify } = useNotifications();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);
  const [toDelete, setToDelete] = useState(null);
  const { data, loading, error, reload, setData } = useFetch(
    () => adminApi.users({ search: debounced || undefined, page }), [debounced, page],
  );

  async function patch(user, body) {
    try {
      const updated = await adminApi.updateUser(user.id, body);
      setData((d) => ({ ...d, data: d.data.map((u) => (u.id === user.id ? updated : u)) }));
      notify('Изменения сохранены', 'success');
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  }

  async function remove() {
    try {
      await adminApi.removeUser(toDelete.id);
      notify('Пользователь удален', 'success');
      reload();
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="stack">
      <h1>Пользователи</h1>
      <div className="toolbar">
        <div className="filters__search"><Search size={18} />
          <input type="search" placeholder="Имя или email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Поиск" />
        </div>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Пользователь</th><th>Роль</th><th className="hide-mobile">С нами с</th><th className="hide-mobile">Статус</th><th aria-label="Действия" /></tr></thead>
            <tbody>
              {data.data.map((u) => (
                <tr key={u.id} className={u.blocked ? 'is-muted' : ''}>
                  <td>
                    <b>{u.name}</b>
                    <small className="muted">{u.email}</small>
                    {u.blocked && <small className="only-mobile"><span className="chip chip--danger">Заблокирован</span></small>}
                  </td>
                  <td>
                    <select value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u, { role: e.target.value })} aria-label="Роль">
                      <option value="user">Пользователь</option>
                      <option value="admin">Администратор</option>
                    </select>
                  </td>
                  <td className="hide-mobile nowrap">{formatDate(u.createdAt)}</td>
                  <td className="hide-mobile">{u.blocked ? <span className="chip chip--danger">Заблокирован</span> : <span className="chip chip--status-registered">Активен</span>}</td>
                  <td className="table__actions">
                    {u.id === me.id ? <ShieldCheck size={18} className="muted" title="Это вы" /> : (
                      <>
                        <button type="button" className="icon-btn icon-btn--sm" onClick={() => patch(u, { blocked: !u.blocked })} title={u.blocked ? 'Разблокировать' : 'Заблокировать'}>
                          {u.blocked ? <UserCheck size={16} /> : <Ban size={16} />}
                        </button>
                        <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => setToDelete(u)} title="Удалить"><Trash2 size={16} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={setPage} />}
      {toDelete && (
        <ConfirmDialog title="Удалить пользователя?" text={`${toDelete.name} (${toDelete.email}) будет удален вместе с регистрациями и напоминаниями.`}
          confirmLabel="Удалить" danger onConfirm={remove} onCancel={() => setToDelete(null)} />
      )}
    </div>
  );
}

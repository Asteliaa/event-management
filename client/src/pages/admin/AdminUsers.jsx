import { useState } from 'react';
import { Ban, PauseCircle, PlayCircle, Search, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
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
  const [status, setStatus] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const { data, loading, error, reload, setData } = useFetch(
    () => adminApi.users({ search: debounced || undefined, status: status || undefined, page }), [debounced, status, page],
  );

  // блокировка и роль – PATCH; деактивация и возврат – отдельные действия
  async function patch(user, body) {
    await apply(user, () => adminApi.updateUser(user.id, body));
  }

  async function apply(user, request) {
    try {
      const updated = await request();
      setData((d) => ({ ...d, data: d.data.map((u) => (u.id === user.id ? updated : u)) }));
      notify('Изменения сохранены', 'success');
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  }

  async function remove() {
    try {
      await adminApi.removeUser(toDelete.id);
      notify('Аккаунт удален, данные обезличены', 'success');
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
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Состояние аккаунта">
          <option value="">Все, кроме удаленных</option>
          <option value="active">Активные</option>
          <option value="deactivated">Деактивированные</option>
          <option value="deleted">Удаленные</option>
        </select>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Пользователь</th><th>Роль</th><th className="hide-mobile">С нами с</th><th className="hide-mobile">Статус</th><th aria-label="Действия" /></tr></thead>
            <tbody>
              {data.data.map((u) => (
                <tr key={u.id} className={u.blocked || u.status !== 'active' ? 'is-muted' : ''}>
                  <td>
                    <b>{u.name}</b>
                    <small className="muted">{u.email}</small>
                    {u.blocked && <small className="only-mobile"><span className="chip chip--danger">Заблокирован</span></small>}
                  </td>
                  <td>
                    <select value={u.role} disabled={u.id === me.id || u.status === 'deleted'} onChange={(e) => patch(u, { role: e.target.value })} aria-label="Роль">
                      <option value="user">Участник</option>
                      <option value="organizer">Организатор</option>
                      <option value="admin">Администратор</option>
                    </select>
                  </td>
                  <td className="hide-mobile nowrap">{formatDate(u.createdAt)}</td>
                  <td className="hide-mobile"><AccountState user={u} /></td>
                  <td className="table__actions">
                    {u.id === me.id ? <ShieldCheck size={18} className="muted" title="Это вы" /> : u.status !== 'deleted' && (
                      <>
                        {u.status === 'deactivated' ? (
                          <button type="button" className="icon-btn icon-btn--sm" onClick={() => apply(u, () => adminApi.reactivateUser(u.id))} title="Вернуть аккаунт">
                            <PlayCircle size={16} />
                          </button>
                        ) : (
                          <button type="button" className="icon-btn icon-btn--sm" onClick={() => apply(u, () => adminApi.deactivateUser(u.id))} title="Деактивировать">
                            <PauseCircle size={16} />
                          </button>
                        )}
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
        <ConfirmDialog title="Удалить аккаунт?"
          text={`Необратимо: имя, email и город ${toDelete.name} (${toDelete.email}) будут удалены, сообщения в чатах и комментарии очищены, `
            + 'будущие регистрации отменены. Прошедшие регистрации останутся в истории без личных данных. '
            + 'Организатора с будущими опубликованными мероприятиями удалить нельзя.'}
          confirmLabel="Удалить" danger onConfirm={remove} onCancel={() => setToDelete(null)} />
      )}
    </div>
  );
}

// Блокировка и состояние аккаунта показываются отдельно: это разные действия
function AccountState({ user }) {
  if (user.status === 'deleted') return <span className="chip">Удален</span>;
  return (
    <>
      {user.status === 'deactivated'
        ? <span className="chip">{user.deactivatedBy === 'admin' ? 'Деактивирован администратором' : 'Деактивирован'}</span>
        : !user.blocked && <span className="chip chip--status-registered">Активен</span>}
      {user.blocked && <span className="chip chip--danger">Заблокирован</span>}
    </>
  );
}

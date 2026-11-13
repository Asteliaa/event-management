import { useState } from 'react';
import { Link } from 'react-router';
import { BarChart3, Eye, Pencil, Plus, Users } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { eventsApi } from '../../api/index.js';
import { EmptyState, ErrorState, Modal, Pagination, Spinner } from '../../components/ui/index.jsx';
import ParticipantsModal from '../../components/events/ParticipantsModal.jsx';
import { EVENT_STATUS_LABELS, TYPE_LABELS, formatShort, formatTime } from '../../utils/format.js';

function StatsModal({ event, onClose }) {
  const { data, loading, error } = useFetch(() => eventsApi.stats(event.id), [event.id]);
  return (
    <Modal title={`Статистика: ${event.title}`} onClose={onClose}>
      {loading && <Spinner />}
      {error && <ErrorState message={error} />}
      {data && (
        <dl className="stack">
          <div><dt className="muted">Активных регистраций</dt><dd>{data.registrations.active}</dd></div>
          <div><dt className="muted">Посетили</dt><dd>{data.registrations.attended}</dd></div>
          <div><dt className="muted">Отменено</dt><dd>{data.registrations.cancelled}</dd></div>
          <div><dt className="muted">Заполненность</dt><dd>{data.fillRate === null ? 'без ограничения мест' : `${data.fillRate}%`}</dd></div>
          <div><dt className="muted">В избранном</dt><dd>{data.favorites}</dd></div>
        </dl>
      )}
    </Modal>
  );
}

// Кабинет организатора: только свои мероприятия (права проверяет сервер),
// участники с email и выгрузкой CSV, статистика
export default function OrganizerEvents() {
  useDocumentTitle('Мои мероприятия');
  const [page, setPage] = useState(1);
  const [participants, setParticipants] = useState(null);
  const [stats, setStats] = useState(null);
  const { data, loading, error, reload } = useFetch((signal) => eventsApi.managed({ page, limit: 10 }, signal), [page]);

  return (
    <div className="container page stack">
      <div className="page__head page__head--row">
        <h1>Мои мероприятия</h1>
        <Link to="/organizer/events/new" className="btn btn--primary"><Plus size={16} /> Создать</Link>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data?.data.length === 0 && (
        <EmptyState icon={Plus} title="Мероприятий пока нет" text="Создайте первое мероприятие – оно появится здесь." />
      )}
      {data?.data.length > 0 && (
        <div className="card table-wrap">
          <table className="table table--hover">
            <thead><tr><th>Название</th><th className="hide-mobile">Дата</th><th>Регистрации</th><th aria-label="Действия" /></tr></thead>
            <tbody>
              {data.data.map((e) => (
                <tr key={e.id} className={e.status === 'cancelled' ? 'is-muted' : ''}>
                  <td>
                    <b>{e.title}</b>
                    <small className="muted">{TYPE_LABELS[e.type]}, {EVENT_STATUS_LABELS[e.status].toLowerCase()}</small>
                  </td>
                  <td className="hide-mobile nowrap">{e.startsAt ? `${formatShort(e.startsAt, e.timezone)}, ${formatTime(e.startsAt, e.timezone)}` : 'без даты'}</td>
                  <td className="nowrap">
                    {e.registrations.active}{e.capacity ? ` / ${e.capacity}` : ''}
                    {e.registrations.cancelled > 0 && <small className="muted">отменено {e.registrations.cancelled}</small>}
                  </td>
                  <td className="table__actions">
                    <Link to={`/events/${e.id}`} className="icon-btn icon-btn--sm" title="Открыть"><Eye size={16} /></Link>
                    <button type="button" className="icon-btn icon-btn--sm" title="Участники" onClick={() => setParticipants(e)}><Users size={16} /></button>
                    <button type="button" className="icon-btn icon-btn--sm" title="Статистика" onClick={() => setStats(e)}><BarChart3 size={16} /></button>
                    <Link to={`/organizer/events/${e.id}/edit`} className="icon-btn icon-btn--sm" title="Редактировать"><Pencil size={16} /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={setPage} />}
      {participants && <ParticipantsModal event={participants} onClose={() => setParticipants(null)} />}
      {stats && <StatsModal event={stats} onClose={() => setStats(null)} />}
    </div>
  );
}

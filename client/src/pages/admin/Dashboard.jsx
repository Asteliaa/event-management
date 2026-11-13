import { Link } from 'react-router';
import { BellRing, CalendarRange, Plus, Ticket, Users, CalendarClock } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { adminApi } from '../../api/index.js';
import { ErrorState, Spinner } from '../../components/ui/index.jsx';
import { TYPE_LABELS, formatShort } from '../../utils/format.js';

function Bars({ items, label, value, color }) {
  const max = Math.max(...items.map(value), 1);
  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={label(item)}>
          <span className="bars__label">{label(item)}</span>
          <span className="bars__track"><span className="bars__fill" style={{ width: `${(value(item) / max) * 100}%`, background: color?.(item) }} /></span>
          <span className="bars__value">{value(item)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  useDocumentTitle('Админ-панель');
  const { data, loading, error, reload } = useFetch(() => adminApi.stats(), []);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { totals } = data;

  const kpis = [
    { icon: CalendarRange, label: 'Мероприятий', value: totals.events, sub: `${totals.upcoming} предстоящих` },
    { icon: Users, label: 'Пользователей', value: totals.users },
    { icon: Ticket, label: 'Регистраций', value: totals.registrations, sub: `${totals.cancelledRegistrations} отменено` },
    { icon: BellRing, label: 'Напоминаний', value: totals.remindersSent, sub: 'отправлено' },
  ];

  // последние 14 дней, включая дни без регистраций
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 864e5);
    const key = d.toISOString().slice(0, 10);
    return { key, label: formatShort(d), count: data.timeline.find((t) => t.date === key)?.count || 0 };
  });
  const maxDay = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="stack">
      <div className="page__head page__head--row">
        <h1>Обзор</h1>
        <Link to="/admin/events/new" className="btn btn--primary"><Plus size={16} /> Новое мероприятие</Link>
      </div>
      <div className="kpis">
        {kpis.map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="card kpi">
            <span className="kpi__icon"><Icon size={20} /></span>
            <span className="kpi__value">{value}</span>
            <span className="kpi__label">{label}</span>
            {sub && <span className="kpi__sub">{sub}</span>}
          </div>
        ))}
      </div>

      <div className="card panel">
        <h3 className="panel__title"><CalendarClock size={18} /> Регистрации за 14 дней</h3>
        <div className="columns" role="img" aria-label="График регистраций по дням">
          {days.map((d) => (
            <div key={d.key} className="columns__col" title={`${d.label}: ${d.count}`}>
              <span className="columns__value">{d.count || ''}</span>
              <span className="columns__bar" style={{ height: `${(d.count / maxDay) * 100}%` }} />
              <span className="columns__label">{d.label.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid--2">
        <div className="card panel">
          <h3 className="panel__title">По категориям (занято мест)</h3>
          <Bars items={data.byCategory} label={(c) => c.name} value={(c) => c.seats} color={(c) => c.color} />
        </div>
        <div className="card panel">
          <h3 className="panel__title">По форматам (мероприятий)</h3>
          <Bars items={data.byType} label={(t) => TYPE_LABELS[t.type]} value={(t) => t.events} />
        </div>
      </div>

      <div className="card panel">
        <h3 className="panel__title">Самые популярные предстоящие</h3>
        <table className="table">
          <thead><tr><th>Мероприятие</th><th>Дата</th><th>Занято</th></tr></thead>
          <tbody>
            {data.topEvents.map((e) => (
              <tr key={e.id}>
                <td><Link to={`/events/${e.id}`}>{e.title}</Link></td>
                <td>{formatShort(e.startsAt)}</td>
                <td>{e.seatsTaken}{e.capacity ? ` / ${e.capacity}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EventStats({ stats }) {
  const items = [
    ['Всего', stats.total],
    ['Предстоящих', stats.upcoming],
    ['Прошедших', stats.past],
    ['Мест суммарно', stats.seats],
  ];
  return (
    <dl className="stats">
      {items.map(([label, value]) => (
        <div key={label} className="stat">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

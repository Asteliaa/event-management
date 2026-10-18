// Чистые функции фильтрации, сортировки и подсчета статистики.
// Вынесены из компонента, чтобы их можно было мемоизировать и переиспользовать в ЛР5.

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function filterEvents(events, { query, type, period }) {
  const q = query.trim().toLowerCase();
  const today = todayISO();
  return events.filter((event) => {
    if (type !== 'all' && event.type !== type) return false;
    if (period === 'upcoming' && event.date < today) return false;
    if (period === 'past' && event.date >= today) return false;
    if (!q) return true;
    return (
      event.title.toLowerCase().includes(q) ||
      event.description.toLowerCase().includes(q)
    );
  });
}

const comparators = {
  'date-asc': (a, b) => a.date.localeCompare(b.date),
  'date-desc': (a, b) => b.date.localeCompare(a.date),
  'title-asc': (a, b) => a.title.localeCompare(b.title, 'ru'),
  'capacity-desc': (a, b) => b.capacity - a.capacity,
};

export function sortEvents(events, sortBy) {
  // Копия массива: sort() изменяет исходный массив, а состояние React менять напрямую нельзя
  return [...events].sort(comparators[sortBy] ?? comparators['date-asc']);
}

export function getStats(events) {
  const today = todayISO();
  const upcoming = events.filter((event) => event.date >= today).length;
  return {
    total: events.length,
    upcoming,
    past: events.length - upcoming,
    seats: events.reduce((sum, event) => sum + event.capacity, 0),
  };
}

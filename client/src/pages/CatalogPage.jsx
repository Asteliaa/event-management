import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarX2 } from 'lucide-react';
import { useFetch } from '../hooks/useFetch.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { eventsApi } from '../api/index.js';
import EventCard, { EventCardSkeleton } from '../components/events/EventCard.jsx';
import EventFilters from '../components/events/EventFilters.jsx';
import { EmptyState, ErrorState, Pagination } from '../components/ui/index.jsx';
import { plural } from '../utils/format.js';

const FILTER_KEYS = ['search', 'type', 'category', 'city', 'online', 'when', 'sort', 'page'];

// Каталог: параметры фильтров хранятся в URL (useSearchParams), поиск – с задержкой (debounce)
export default function CatalogPage() {
  useDocumentTitle('Мероприятия');
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const [search, setSearch] = useState(values.search);
  const debouncedSearch = useDebounce(search, 400);

  // введенный текст попадает в URL через 400 мс после последнего нажатия
  useEffect(() => {
    if (debouncedSearch !== values.search) update('search', debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: key === 'search' });
  }

  const query = Object.fromEntries(Object.entries({ ...values, limit: 12 }).filter(([, v]) => v));
  const { data, loading, error, reload } = useFetch((signal) => eventsApi.list(query, signal), [params.toString()]);

  return (
    <div className="container page">
      <header className="page__head">
        <h1>Мероприятия</h1>
        {data && <p className="muted">Найдено {data.meta.total} {plural(data.meta.total, ['мероприятие', 'мероприятия', 'мероприятий'])}</p>}
      </header>

      <EventFilters
        values={values}
        search={search}
        onSearch={setSearch}
        onChange={update}
        onReset={() => { setSearch(''); setParams({}); }}
      />

      {error && <ErrorState message={error} onRetry={reload} />}
      {!error && (
        <div className={`posters ${loading && data ? 'is-loading' : ''}`}>
          {loading && !data && Array.from({ length: 6 }, (_, i) => <EventCardSkeleton key={i} />)}
          {data?.data.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
      {data && data.data.length === 0 && !loading && (
        <EmptyState icon={CalendarX2} title="Ничего не найдено" text="Попробуйте изменить фильтры или поисковый запрос." />
      )}
      {data && (
        <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => { update('page', String(p)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Save } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { categoriesApi, eventsApi } from '../../api/index.js';
import { getErrorMessage, getFieldErrors } from '../../api/client.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import EventRow from '../../components/events/EventCard.jsx';
import { Field, Spinner } from '../../components/ui/index.jsx';
import { TYPE_LABELS, toLocalInput } from '../../utils/format.js';

const EMPTY = {
  title: '', description: '', type: 'conference', status: 'published', category: '', startsAt: '', endsAt: '',
  capacity: '', coverUrl: '', city: '', venue: '', online: false, url: '', tags: '',
};

const toForm = (e) => ({
  title: e.title, description: e.description || '', type: e.type, status: e.status, category: e.category?.id || '',
  startsAt: toLocalInput(e.startsAt), endsAt: toLocalInput(e.endsAt), capacity: e.capacity ?? '', coverUrl: e.coverUrl || '',
  city: e.location?.city || '', venue: e.location?.venue || '', online: Boolean(e.location?.online), url: e.location?.url || '',
  tags: (e.tags || []).join(', '),
});

// Данные формы → тело запроса API (пустые строки → null, локальное время → ISO)
const toBody = (f) => ({
  title: f.title,
  description: f.description,
  type: f.type,
  status: f.status,
  category: f.category || null,
  startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : undefined,
  endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
  capacity: f.capacity === '' ? null : Number(f.capacity),
  coverUrl: f.coverUrl,
  location: { city: f.city, venue: f.venue, online: f.online, url: f.url },
  tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
});

export default function EventFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  useDocumentTitle(isEdit ? 'Редактирование' : 'Новое мероприятие');
  const navigate = useNavigate();
  const { notify } = useNotifications();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const { data: categories } = useFetch(() => categoriesApi.list(), []);
  const existing = useFetch((signal) => (isEdit ? eventsApi.get(id, signal) : Promise.resolve(null)), [id]);

  useEffect(() => {
    if (existing.data) setForm(toForm(existing.data));
  }, [existing.data]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = toBody(form);
      const saved = isEdit ? await eventsApi.update(id, body) : await eventsApi.create(body);
      notify(isEdit ? 'Изменения сохранены' : 'Мероприятие создано', 'success');
      navigate(`/events/${saved.id}`);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k.replace('location.', ''), v])));
      notify(getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (isEdit && existing.loading) return <Spinner />;

  const preview = {
    ...toBody(form), id: 'preview', startsAt: form.startsAt || new Date().toISOString(),
    category: categories?.find((c) => c.id === form.category),
  };

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <div className="page__head page__head--row">
        <h1>{isEdit ? 'Редактирование мероприятия' : 'Новое мероприятие'}</h1>
        <button type="submit" className="btn btn--primary" disabled={busy}><Save size={16} /> {busy ? 'Сохранение…' : 'Сохранить'}</button>
      </div>

      <div className="form-layout">
        <div className="card panel form">
          <Field label="Название *" error={errors.title}><input value={form.title} onChange={set('title')} required /></Field>
          <Field label="Описание" error={errors.description}><textarea rows={6} value={form.description} onChange={set('description')} /></Field>
          <div className="form__row">
            <Field label="Формат *" error={errors.type}>
              <select value={form.type} onChange={set('type')}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Категория" error={errors.category}>
              <select value={form.category} onChange={set('category')}>
                <option value="">Без категории</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="form__row">
            <Field label="Начало *" error={errors.startsAt}><input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} /></Field>
            <Field label="Окончание" error={errors.endsAt}><input type="datetime-local" value={form.endsAt} onChange={set('endsAt')} /></Field>
          </div>
          <div className="form__row">
            <Field label="Вместимость" error={errors.capacity} hint="Пусто – без ограничений">
              <input type="number" min="1" value={form.capacity} onChange={set('capacity')} />
            </Field>
            <Field label="Статус" error={errors.status}>
              <select value={form.status} onChange={set('status')}>
                <option value="published">Опубликовано</option>
                <option value="cancelled">Отменено</option>
              </select>
            </Field>
          </div>
          <label className="checkbox"><input type="checkbox" checked={form.online} onChange={set('online')} /> Онлайн-мероприятие</label>
          {form.online ? (
            <Field label="Ссылка на трансляцию" error={errors.url}><input value={form.url} onChange={set('url')} placeholder="https://" /></Field>
          ) : (
            <div className="form__row">
              <Field label="Город" error={errors.city}><input value={form.city} onChange={set('city')} /></Field>
              <Field label="Место проведения" error={errors.venue}><input value={form.venue} onChange={set('venue')} /></Field>
            </div>
          )}
          <Field label="Теги" hint="Через запятую: react, frontend" error={errors.tags}><input value={form.tags} onChange={set('tags')} /></Field>
          <Field label="Обложка (ссылка на изображение)" hint="Необязательно" error={errors.coverUrl}>
            <input value={form.coverUrl} onChange={set('coverUrl')} placeholder="https://" />
          </Field>
        </div>
        <aside className="form-preview">
          <p className="muted small">Так мероприятие будет выглядеть в программе</p>
          <div className="agenda"><EventRow event={{ ...preview, title: form.title || 'Название мероприятия', seatsTaken: 0, seatsLeft: preview.capacity }} /></div>
        </aside>
      </div>
    </form>
  );
}

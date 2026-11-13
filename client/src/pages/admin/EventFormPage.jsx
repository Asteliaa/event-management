import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Save, Send } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { categoriesApi, eventsApi } from '../../api/index.js';
import { getErrorMessage, getFieldErrors } from '../../api/client.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import EventRow from '../../components/events/EventCard.jsx';
import { Field, Spinner } from '../../components/ui/index.jsx';
import { EVENT_STATUS_LABELS, TYPE_LABELS, browserTimeZone, fromZonedInput, toZonedInput } from '../../utils/format.js';

// Список IANA-поясов браузера (если недоступен – только пояс пользователя и UTC)
const TIME_ZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [browserTimeZone(), 'UTC'];

const EMPTY = {
  title: '', description: '', type: 'conference', category: '', timezone: browserTimeZone(), startsAt: '', endsAt: '',
  registrationOpen: true, registrationDeadline: '',
  capacity: '', coverUrl: '', city: '', venue: '', online: false, url: '', tags: '',
};

// Даты в форме – «настенное» время по поясу мероприятия
const toForm = (e) => ({
  title: e.title, description: e.description || '', type: e.type, category: e.category?.id || '', timezone: e.timezone,
  startsAt: toZonedInput(e.startsAt, e.timezone), endsAt: toZonedInput(e.endsAt, e.timezone),
  registrationOpen: e.registrationOpen !== false, registrationDeadline: toZonedInput(e.registrationDeadline, e.timezone),
  capacity: e.capacity ?? '', coverUrl: e.coverUrl || '',
  city: e.location?.city || '', venue: e.location?.venue || '', online: Boolean(e.location?.online), url: e.location?.url || '',
  tags: (e.tags || []).join(', '),
});

// Данные формы → тело запроса API (пустые строки → null, время по поясу мероприятия → ISO)
const toBody = (f) => ({
  title: f.title,
  description: f.description,
  type: f.type,
  timezone: f.timezone,
  category: f.category || null,
  startsAt: fromZonedInput(f.startsAt, f.timezone),
  endsAt: fromZonedInput(f.endsAt, f.timezone),
  registrationOpen: f.registrationOpen,
  registrationDeadline: fromZonedInput(f.registrationDeadline, f.timezone),
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

  // Новое мероприятие: «Сохранить черновик» или «Опубликовать» (требования публикации проверяет сервер).
  // У существующего состояние меняется действиями на странице мероприятия и в списке
  async function handleSubmit(e, publish = false) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = toBody(form);
      const saved = isEdit ? await eventsApi.update(id, body) : await eventsApi.create({ ...body, status: publish ? 'published' : 'draft' });
      notify(isEdit ? 'Изменения сохранены' : publish ? 'Мероприятие опубликовано' : 'Черновик сохранен', 'success');
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
    ...toBody(form), id: 'preview', startsAt: toBody(form).startsAt || new Date().toISOString(),
    category: categories?.find((c) => c.id === form.category),
  };

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <div className="page__head page__head--row">
        <h1>
          {isEdit ? 'Редактирование мероприятия' : 'Новое мероприятие'}
          {isEdit && existing.data && <small className="muted"> {EVENT_STATUS_LABELS[existing.data.status]}</small>}
        </h1>
        <div className="toolbar">
          {isEdit ? (
            <button type="submit" className="btn btn--primary" disabled={busy}><Save size={16} /> {busy ? 'Сохранение…' : 'Сохранить'}</button>
          ) : (
            <>
              <button type="submit" className="btn btn--soft" disabled={busy}><Save size={16} /> Сохранить черновик</button>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={(e) => handleSubmit(e, true)}><Send size={16} /> Опубликовать</button>
            </>
          )}
        </div>
      </div>
      {isEdit && existing.data?.status === 'published' && (
        <p className="notice">Изменение начала или окончания – перенос: участники получат уведомление, напоминания пересчитаются.</p>
      )}

      <div className="form-layout">
        <div className="card panel form">
          <h3 className="form__section-title">Основное</h3>
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
          <div className="form__section">
            <h3 className="form__section-title">Дата и участники</h3>
            <Field label="Часовой пояс мероприятия *" error={errors.timezone} hint="Время ниже указывается по этому поясу">
              <select value={form.timezone} onChange={set('timezone')}>
                {TIME_ZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Field>
            <div className="form__row">
              <Field label="Начало" error={errors.startsAt} hint="Обязательно для публикации"><input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} /></Field>
              <Field label="Окончание" error={errors.endsAt} hint="Обязательно для публикации"><input type="datetime-local" value={form.endsAt} onChange={set('endsAt')} /></Field>
            </div>
            <div className="form__row">
              <Field label="Вместимость" error={errors.capacity} hint="Пусто – без ограничений">
                <input type="number" min="1" value={form.capacity} onChange={set('capacity')} />
              </Field>
              <Field label="Регистрация до" error={errors.registrationDeadline} hint="Пусто – до начала">
                <input type="datetime-local" value={form.registrationDeadline} onChange={set('registrationDeadline')} />
              </Field>
            </div>
            <label className="checkbox"><input type="checkbox" checked={form.registrationOpen} onChange={set('registrationOpen')} /> Регистрация открыта</label>
          </div>
          <div className="form__section">
            <h3 className="form__section-title">Место проведения</h3>
            <label className="checkbox"><input type="checkbox" checked={form.online} onChange={set('online')} /> Онлайн-мероприятие</label>
            {form.online ? (
              <Field label="Ссылка подключения" error={errors.url} hint="Видят только записавшиеся участники, организатор и администратор">
                <input value={form.url} onChange={set('url')} placeholder="https://" />
              </Field>
            ) : (
              <div className="form__row">
                <Field label="Город" error={errors.city}><input value={form.city} onChange={set('city')} /></Field>
                <Field label="Место проведения" error={errors.venue}><input value={form.venue} onChange={set('venue')} /></Field>
              </div>
            )}
          </div>
          <div className="form__section">
            <h3 className="form__section-title">Дополнительно</h3>
            <Field label="Теги" hint="Через запятую: react, frontend" error={errors.tags}><input value={form.tags} onChange={set('tags')} /></Field>
            <Field label="Обложка (ссылка на изображение)" hint="Необязательно" error={errors.coverUrl}>
              <input value={form.coverUrl} onChange={set('coverUrl')} placeholder="https://" />
            </Field>
          </div>
        </div>
        <aside className="form-preview">
          <p className="muted small">Предпросмотр в каталоге</p>
          <div className="agenda"><EventRow event={{ ...preview, title: form.title || 'Название мероприятия', seatsTaken: 0, seatsLeft: preview.capacity }} /></div>
        </aside>
      </div>
    </form>
  );
}

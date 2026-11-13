import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { KeyRound } from 'lucide-react';
import { authApi } from '../api/index.js';
import { getErrorMessage, getFieldErrors } from '../api/client.js';
import { useNotifications } from '../context/NotificationContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { Field } from '../components/ui/index.jsx';

// «Забыли пароль?»: ответ сервера одинаков для любого адреса, поэтому страница всегда показывает
// одно и то же сообщение и не сообщает, есть ли такой аккаунт
export function ForgotPasswordPage() {
  useDocumentTitle('Восстановление пароля');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Некорректный email');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="card auth__card" onSubmit={submit} noValidate>
        <span className="logo__mark" aria-hidden="true"><KeyRound size={22} /></span>
        <h1>Восстановление пароля</h1>
        {/* разные key: иначе React переиспользует кнопку «Отправить еще раз» как кнопку отправки формы
            и щелчок по ней сразу отправляет форму повторно */}
        {sent ? (
          <Fragment key="sent">
            <p className="notice notice--success" role="status">
              Если аккаунт с адресом {email} существует, мы отправили на него письмо со ссылкой. Ссылка действует 30 минут.
            </p>
            <p className="auth__sub">Не пришло письмо? Проверьте папку «Спам» или запросите ссылку еще раз через несколько минут.</p>
            <button type="button" className="btn btn--soft btn--block" onClick={() => setSent(false)}>Отправить еще раз</button>
          </Fragment>
        ) : (
          <Fragment key="form">
            <p className="auth__sub">Укажите email, с которым вы регистрировались. Мы пришлем ссылку для сброса пароля.</p>
            <Field label="Email" error={error}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
            </Field>
            <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
              {busy ? 'Отправляем…' : 'Получить ссылку'}
            </button>
          </Fragment>
        )}
        <p className="auth__switch"><Link to="/login">Вернуться ко входу</Link></p>
      </form>
    </div>
  );
}

// Токен приходит во фрагменте ссылки (#token=…): он не отправляется на сервер при загрузке страницы
// и не попадает в Referer. Страница сразу убирает его из адресной строки и истории
function takeTokenFromHash() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
  return token;
}

export function ResetPasswordPage() {
  useDocumentTitle('Новый пароль');
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const [token] = useState(takeTokenFromHash);
  const [form, setForm] = useState({ password: '', passwordConfirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // запрет Referer для всех запросов и переходов со страницы сброса
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const clientErrors = {};
    if (form.password.length < 8) clientErrors.password = 'Пароль не короче 8 символов';
    else if (!/\d/.test(form.password) || !/[A-Za-zА-Яа-яЁё]/.test(form.password)) clientErrors.password = 'Пароль должен содержать букву и цифру';
    if (form.password !== form.passwordConfirm) clientErrors.passwordConfirm = 'Пароли не совпадают';
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;
    setBusy(true);
    setFormError('');
    try {
      await authApi.resetPassword({ token, ...form });
      // автоматического входа нет: все сеансы завершены, пользователь входит с новым паролем
      notify('Пароль изменен. Войдите с новым паролем', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="auth">
        <div className="card auth__card">
          <h1>Ссылка недействительна</h1>
          <p className="auth__sub">Откройте ссылку из письма полностью или запросите новую.</p>
          <Link to="/forgot-password" className="btn btn--primary btn--block">Запросить новую ссылку</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <form className="card auth__card" onSubmit={submit} noValidate>
        <span className="logo__mark" aria-hidden="true"><KeyRound size={22} /></span>
        <h1>Новый пароль</h1>
        <p className="auth__sub">После сохранения все сеансы на других устройствах завершатся.</p>
        <Field label="Новый пароль" error={errors.password} hint="Не короче 8 символов, буква и цифра">
          <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" autoFocus />
        </Field>
        <Field label="Повторите пароль" error={errors.passwordConfirm}>
          <input type="password" value={form.passwordConfirm} onChange={set('passwordConfirm')} autoComplete="new-password" />
        </Field>
        {formError && (
          <p className="form-error" role="alert">
            {formError}{' '}
            {/недействительна/.test(formError) && <Link to="/forgot-password">Запросить новую ссылку</Link>}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить пароль'}
        </button>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CalendarHeart, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { getErrorMessage, getFieldErrors } from '../api/client.js';
import { Field } from '../components/ui/index.jsx';

function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-group">
      <input type={visible ? 'text' : 'password'} {...props} />
      <button type="button" className="icon-btn icon-btn--sm" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}>
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// Простая проверка на клиенте; окончательная валидация выполняется на сервере
function validate({ name, email, password }, isRegister) {
  const errors = {};
  if (isRegister && (!name || name.trim().length < 2)) errors.name = 'Имя не короче 2 символов';
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Некорректный email';
  if (isRegister) {
    if (password.length < 8) errors.password = 'Пароль не короче 8 символов';
    else if (!/\d/.test(password) || !/[A-Za-zА-Яа-яЁё]/.test(password)) errors.password = 'Пароль должен содержать букву и цифру';
  } else if (!password) errors.password = 'Введите пароль';
  return errors;
}

function AuthForm({ mode }) {
  const isRegister = mode === 'register';
  useDocumentTitle(isRegister ? 'Регистрация' : 'Вход');
  const { login, register } = useAuth();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    const clientErrors = validate(form, isRegister);
    setErrors(clientErrors);
    setFormError('');
    if (Object.keys(clientErrors).length) return;
    setBusy(true);
    try {
      const { user, reactivated } = isRegister
        ? { user: await register(form) }
        : await login({ email: form.email, password: form.password });
      if (reactivated) notify(`Аккаунт восстановлен. С возвращением, ${user.name}! Регистрации и напоминания снова активны.`, 'success');
      else notify(isRegister ? `Добро пожаловать, ${user.name}!` : `С возвращением, ${user.name}!`, 'success');
      // возврат на страницу, с которой пользователь пришел на вход (useNavigate)
      navigate(location.state?.from?.pathname || (user.role === 'admin' ? '/admin' : '/profile'), { replace: true });
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="card auth__card" onSubmit={handleSubmit} noValidate>
        <span className="logo__mark" aria-hidden="true"><CalendarHeart size={22} /></span>
        <h1>{isRegister ? 'Создать аккаунт' : 'Вход в EventHub'}</h1>
        <p className="auth__sub">{isRegister ? 'Регистрируйтесь на мероприятия и получайте напоминания' : 'Рады видеть вас снова'}</p>

        {isRegister && (
          <Field label="Имя и фамилия" error={errors.name}>
            <input value={form.name} onChange={set('name')} autoComplete="name" placeholder="Анна Петрова" />
          </Field>
        )}
        <Field label="Email" error={errors.email}>
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" />
        </Field>
        <Field label="Пароль" error={errors.password} hint={isRegister ? 'Не короче 8 символов, буква и цифра' : undefined}>
          <PasswordInput value={form.password} onChange={set('password')} autoComplete={isRegister ? 'new-password' : 'current-password'} />
        </Field>

        {formError && <p className="form-error" role="alert">{formError}</p>}
        {!isRegister && <p className="auth__switch"><Link to="/forgot-password">Забыли пароль?</Link></p>}
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
          {busy ? 'Подождите…' : isRegister ? 'Зарегистрироваться' : 'Войти'}
        </button>

        <p className="auth__switch">
          {isRegister
            ? <>Уже есть аккаунт? <Link to="/login" state={location.state}>Войти</Link></>
            : <>Нет аккаунта? <Link to="/register" state={location.state}>Зарегистрироваться</Link></>}
        </p>
        {!isRegister && <p className="demo-hint">Для проверки (после npm run seed): admin@demo.eventhub.local, пароль admin12345 (администратор) или anna@demo.eventhub.local, пароль user12345.</p>}
      </form>
    </div>
  );
}

export const LoginPage = () => <AuthForm mode="login" />;
export const RegisterPage = () => <AuthForm mode="register" />;

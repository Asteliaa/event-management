import { useState } from 'react';
import { login, getErrorMessage } from '../api.js';

function LoginForm({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const token = await login(email, password);
      onLogin(token);
    } catch (err) {
      setError(err.response && err.response.status === 401 ? 'Неверный email или пароль' : getErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button type="submit" className="primary" disabled={sending}>{sending ? 'Вход...' : 'Войти'}</button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}

export default LoginForm;

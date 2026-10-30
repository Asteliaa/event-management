import { useState } from 'react';
import { readToken } from './api.js';
import EventList from './components/EventList.jsx';
import LoginForm from './components/LoginForm.jsx';

function App() {
  // Токен хранится в localStorage, чтобы вход сохранялся после перезагрузки
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const user = readToken(token);

  function handleLogin(newToken) {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken(null);
  }

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Мероприятия</h1>
          <p className="subtitle">Список конференций, вебинаров и встреч</p>
        </div>
        {user ? (
          <div className="user">
            {user.email} ({user.role})
            <button onClick={handleLogout}>Выйти</button>
          </div>
        ) : (
          <LoginForm onLogin={handleLogin} />
        )}
      </header>
      <EventList isAdmin={user?.role === 'admin'} onUnauthorized={handleLogout} />
    </div>
  );
}

export default App;

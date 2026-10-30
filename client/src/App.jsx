import { useCallback, useEffect, useState } from 'react';
import { readToken } from './api.js';
import { useSocket } from './hooks/useSocket.js';
import EventList from './components/EventList.jsx';
import EventChat from './components/EventChat.jsx';
import LoginForm from './components/LoginForm.jsx';
import Notifications from './components/Notifications.jsx';

let nextId = 1;

function App() {
  // Токен хранится в localStorage, чтобы вход сохранялся после перезагрузки
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const user = readToken(token);
  // Соединение Socket.IO открывается только для вошедшего пользователя
  const { socket, connected, error: socketError } = useSocket(user ? token : null);
  const [online, setOnline] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [chatEvent, setChatEvent] = useState(null);

  const notify = useCallback((text, kind = 'info') => {
    setNotifications((prev) => [...prev.slice(-4), { id: nextId++, text, kind }]);
  }, []);
  const closeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Уведомления от сервера в реальном времени
  useEffect(() => {
    if (!socket) return;
    const me = readToken(token).email;
    const handlers = {
      'users:online': setOnline,
      'user:connected': (u) => notify(`${u.email} в сети`, 'success'),
      'user:disconnected': (u) => notify(`${u.email} не в сети`),
      'event:created': ({ event, by }) => by !== me && notify(`Новое мероприятие «${event.title}» (${by})`),
      'event:updated': ({ event, by }) => by !== me && notify(`Изменено мероприятие «${event.title}» (${by})`),
      'event:deleted': ({ id, title, by }) => {
        setChatEvent((current) => (current && current.id === id ? null : current));
        if (by !== me) notify(`Удалено мероприятие «${title}» (${by})`, 'warning');
      },
      'registration:created': ({ email, title, seatsLeft }) =>
        email !== me && notify(`${email}: регистрация на «${title}», осталось мест: ${seatsLeft ?? 'без ограничений'}`),
      'registration:cancelled': ({ email, title }) =>
        email !== me && notify(`${email}: регистрация на «${title}» отменена`, 'warning'),
    };
    Object.entries(handlers).forEach(([name, fn]) => socket.on(name, fn));
    return () => Object.entries(handlers).forEach(([name, fn]) => socket.off(name, fn));
  }, [socket, token, notify]);

  function handleLogin(newToken) {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken(null);
    setChatEvent(null);
    setOnline([]);
  }

  return (
    <div className={`container ${chatEvent ? 'with-chat' : ''}`}>
      <header className="header">
        <div>
          <h1>Мероприятия</h1>
          <p className="subtitle">Список конференций, вебинаров и встреч</p>
        </div>
        {user ? (
          <div className="user">
            <span
              className={`status ${connected ? 'online' : 'offline'}`}
              title={online.map((u) => u.email).join('\n')}
            >
              {connected ? `онлайн: ${online.length}` : `нет связи${socketError ? ` (${socketError})` : ''}`}
            </span>
            {user.email} ({user.role})
            <button onClick={handleLogout}>Выйти</button>
          </div>
        ) : (
          <LoginForm onLogin={handleLogin} />
        )}
      </header>

      <div className="layout">
        <main>
          <EventList
            isAdmin={user?.role === 'admin'}
            isLoggedIn={Boolean(user)}
            socket={socket}
            chatEventId={chatEvent?.id}
            onChat={setChatEvent}
            onNotify={notify}
            onUnauthorized={handleLogout}
          />
        </main>
        {chatEvent && socket && (
          <EventChat
            key={chatEvent.id}
            socket={socket}
            connected={connected}
            event={chatEvent}
            user={user}
            onClose={() => setChatEvent(null)}
          />
        )}
      </div>

      <Notifications items={notifications} onClose={closeNotification} />
    </div>
  );
}

export default App;

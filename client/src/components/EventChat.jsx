import { useEffect, useRef, useState } from 'react';

const TYPING_TIMEOUT = 2000;

const formatTime = (date) =>
  new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

// Чат мероприятия: комната event:<id> на сервере, история хранится в MongoDB
function EventChat({ socket, connected, event, user, onClose }) {
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  // Кто сейчас печатает: email → true
  const [typing, setTyping] = useState({});
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const typingTimer = useRef(null);
  const listRef = useRef(null);

  // Вход в комнату, подписка на события комнаты и выход при закрытии чата
  useEffect(() => {
    const eventId = event.id;
    const system = (text) => ({ id: `${Date.now()}-${Math.random()}`, system: true, text });

    function join() {
      socket.emitWithAck('event:join', { eventId }).then((res) => {
        setLoading(false);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setError('');
        setMessages(res.history);
        setMembers(res.members);
      });
    }

    const onMessage = (msg) => {
      if (msg.event !== eventId) return;
      setMessages((prev) => [...prev, msg]);
      setTyping((prev) => ({ ...prev, [msg.email]: false }));
    };
    const onTyping = (data) => {
      if (data.eventId === eventId) setTyping((prev) => ({ ...prev, [data.user.email]: data.isTyping }));
    };
    const onJoined = (data) => {
      if (data.eventId !== eventId) return;
      setMembers(data.members);
      setMessages((prev) => [...prev, system(`${data.user.email}: вход в чат`)]);
    };
    const onLeft = (data) => {
      if (data.eventId !== eventId) return;
      setMembers(data.members);
      setTyping((prev) => ({ ...prev, [data.user.email]: false }));
      setMessages((prev) => [...prev, system(`${data.user.email}: выход из чата`)]);
    };

    if (socket.connected) join();
    // После переподключения сервер не помнит комнаты старого сокета, входим заново
    socket.on('connect', join);
    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);
    socket.on('room:joined', onJoined);
    socket.on('room:left', onLeft);

    return () => {
      socket.emit('event:leave', { eventId });
      socket.off('connect', join);
      socket.off('chat:message', onMessage);
      socket.off('chat:typing', onTyping);
      socket.off('room:joined', onJoined);
      socket.off('room:left', onLeft);
      clearTimeout(typingTimer.current);
    };
  }, [socket, event.id]);

  // Прокрутка к последнему сообщению
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  // «Печатает»: true при первом нажатии, false через 2 секунды без ввода или после отправки
  function stopTyping() {
    clearTimeout(typingTimer.current);
    typingTimer.current = null;
    socket.emit('chat:typing', { eventId: event.id, isTyping: false });
  }

  function handleChange(e) {
    setText(e.target.value);
    if (!typingTimer.current) socket.emit('chat:typing', { eventId: event.id, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, TYPING_TIMEOUT);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    stopTyping();
    setSending(true);
    // Подтверждение (acknowledgement): сервер отвечает сохраненным сообщением или ошибкой
    const res = await socket.timeout(5000).emitWithAck('chat:message', { eventId: event.id, text })
      .catch(() => ({ ok: false, error: 'Сервер не ответил, сообщение не отправлено' }));
    setSending(false);
    if (res.ok) {
      setMessages((prev) => [...prev, res.message]);
      setText('');
      setError('');
    } else {
      setError(res.error);
    }
  }

  const typingUsers = Object.keys(typing).filter((email) => typing[email] && email !== user.email);

  return (
    <aside className="chat">
      <div className="chat-header">
        <div>
          <h2>Чат: {event.title}</h2>
          <p className="muted" title={members.map((m) => m.email).join(', ')}>
            В чате: {members.map((m) => m.email).join(', ') || '...'}
          </p>
        </div>
        <button onClick={onClose}>×</button>
      </div>

      <div className="chat-messages" ref={listRef}>
        {loading && <p className="muted">Загрузка истории...</p>}
        {!loading && messages.length === 0 && <p className="muted">Сообщений пока нет</p>}
        {messages.map((m) =>
          m.system ? (
            <p key={m.id} className="chat-system">{m.text}</p>
          ) : (
            <div key={m.id} className={`chat-message ${m.email === user.email ? 'own' : ''}`}>
              <div className="chat-meta">
                {m.email} · {formatTime(m.createdAt)}
              </div>
              <div>{m.text}</div>
            </div>
          )
        )}
      </div>

      <p className="chat-typing">
        {typingUsers.length > 0 && `${typingUsers.join(', ')} печатает...`}
      </p>
      {error && <p className="error">{error}</p>}

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          placeholder="Сообщение"
          value={text}
          onChange={handleChange}
          maxLength={500}
          disabled={!connected}
        />
        <button type="submit" className="primary" disabled={sending || !connected || !text.trim()}>
          Отправить
        </button>
      </form>
    </aside>
  );
}

export default EventChat;

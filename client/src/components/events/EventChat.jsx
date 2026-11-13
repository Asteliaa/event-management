import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatTime } from '../../utils/format.js';

const TYPING_TIMEOUT = 2000;

// Чат мероприятия: комната event:<id> на сервере Socket.IO, история хранится в БД.
// Права проверяет сервер при входе и на каждом сообщении: после отмены участия доступ закрывается (chat:revoked),
// после отмены мероприятия чат остается только для чтения (chat:readonly)
export default function EventChat({ eventId }) {
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [typing, setTyping] = useState({});
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [denied, setDenied] = useState('');
  const typingTimer = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!socket) return undefined;
    const system = (t) => ({ id: `${Date.now()}-${Math.random()}`, system: true, text: t });

    const join = () => socket.emitWithAck('event:join', { eventId }).then((res) => {
      setLoading(false);
      if (!res.ok) return setDenied(res.error);
      setDenied('');
      setError('');
      setReadOnly(Boolean(res.readOnly));
      setMessages(res.history);
      setMembers(res.members);
      return undefined;
    });
    const onMessage = (msg) => {
      if (msg.event !== eventId) return;
      setMessages((prev) => [...prev, msg]);
      setTyping((prev) => ({ ...prev, [msg.user]: false }));
    };
    const onTyping = (d) => d.eventId === eventId && setTyping((prev) => ({ ...prev, [d.user.id]: d.isTyping && d.user.name }));
    const onJoined = (d) => {
      if (d.eventId !== eventId) return;
      setMembers(d.members);
      setMessages((prev) => [...prev, system(`${d.user.name} присоединился к чату`)]);
    };
    const onLeft = (d) => {
      if (d.eventId !== eventId) return;
      setMembers(d.members);
      setTyping((prev) => ({ ...prev, [d.user.id]: false }));
    };

    const onRevoked = (d) => {
      if (d.eventId !== eventId) return;
      setDenied(d.reason === 'ownership_transferred'
        ? 'Мероприятие передано другому организатору, чат закрыт'
        : 'Участие отменено, чат больше недоступен');
      setMembers([]);
    };
    const onReadonly = (d) => d.eventId === eventId && setReadOnly(true);

    if (socket.connected) join();
    socket.on('chat:revoked', onRevoked);
    socket.on('chat:readonly', onReadonly);
    // после переподключения сервер не помнит комнаты старого сокета – входим заново
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
      socket.off('chat:revoked', onRevoked);
      socket.off('chat:readonly', onReadonly);
      clearTimeout(typingTimer.current);
    };
  }, [socket, eventId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  function stopTyping() {
    clearTimeout(typingTimer.current);
    typingTimer.current = null;
    socket?.emit('chat:typing', { eventId, isTyping: false });
  }

  function handleChange(e) {
    setText(e.target.value);
    if (!typingTimer.current) socket?.emit('chat:typing', { eventId, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, TYPING_TIMEOUT);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || !socket) return;
    stopTyping();
    // подтверждение (acknowledgement): сервер отвечает сохраненным сообщением или ошибкой
    const res = await socket.timeout(5000).emitWithAck('chat:message', { eventId, text })
      .catch(() => ({ ok: false, error: 'Сервер не ответил, сообщение не отправлено' }));
    if (res.ok) {
      setMessages((prev) => [...prev, res.message]);
      setText('');
      setError('');
    } else {
      if (res.revoked) setDenied(res.error);
      if (res.readOnly) setReadOnly(true);
      setError(res.error);
    }
  }

  if (denied) {
    return (
      <section className="card chat">
        <header className="chat__header"><h3><MessageCircle size={18} /> Чат участников</h3></header>
        <p className="muted chat__notice">{denied}</p>
      </section>
    );
  }

  const typingNames = Object.entries(typing).filter(([id, name]) => name && id !== user.id).map(([, n]) => n);

  return (
    <section className="card chat">
      <header className="chat__header">
        <h3><MessageCircle size={18} /> Чат участников</h3>
        <span className={`status-dot ${connected ? 'is-on' : ''}`}>
          {connected ? `в чате: ${members.length}` : 'нет соединения'}
        </span>
      </header>
      <div className="chat__messages" ref={listRef}>
        {loading && <p className="muted">Загрузка истории…</p>}
        {!loading && messages.length === 0 && <p className="muted center">Сообщений пока нет. Напишите первым!</p>}
        {messages.map((m) => (m.system ? (
          <p key={m.id} className="chat__system">{m.text}</p>
        ) : (
          <div key={m.id} className={`chat__msg ${m.user === user.id ? 'is-own' : ''}`}>
            <span className="chat__meta"><b>{m.author}</b> <time>{formatTime(m.createdAt)}</time></span>
            <span className={`chat__text ${m.deleted ? 'muted' : ''}`}>{m.deleted ? <i>{m.text}</i> : m.text}</span>
          </div>
        )))}
      </div>
      <p className="chat__typing">{typingNames.length > 0 && `${typingNames.join(', ')} печатает…`}</p>
      {readOnly ? (
        <p className="muted chat__notice">Мероприятие отменено: история доступна только для чтения.</p>
      ) : (
        <>
          {error && <p className="form-error">{error}</p>}
          <form className="chat__form" onSubmit={handleSubmit}>
            <input placeholder="Сообщение" value={text} onChange={handleChange} maxLength={500} disabled={!connected} aria-label="Сообщение" />
            <button type="submit" className="btn btn--primary btn--icon" disabled={!connected || !text.trim()} aria-label="Отправить">
              <Send size={18} />
            </button>
          </form>
        </>
      )}
    </section>
  );
}

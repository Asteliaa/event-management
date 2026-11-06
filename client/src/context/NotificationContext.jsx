import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { remindersApi } from '../api/index.js';
import { useAuth } from './AuthContext.jsx';
import { useSocket } from './SocketContext.jsx';

const NotificationContext = createContext(null);

// Глобальное состояние уведомлений на useReducer:
// toasts – всплывающие сообщения, inbox – отправленные напоминания (центр уведомлений)
const initialState = { toasts: [], inbox: [] };
let nextId = 1;

function reducer(state, action) {
  switch (action.type) {
    case 'TOAST_ADD':
      return { ...state, toasts: [...state.toasts.slice(-3), action.toast] };
    case 'TOAST_REMOVE':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case 'INBOX_SET':
      return { ...state, inbox: action.items };
    case 'INBOX_ADD':
      return { ...state, inbox: [action.item, ...state.inbox.filter((i) => i.id !== action.item.id)] };
    case 'INBOX_READ':
      return { ...state, inbox: state.inbox.map((i) => (i.id === action.id ? { ...i, readAt: new Date().toISOString() } : i)) };
    case 'INBOX_READ_ALL':
      return { ...state, inbox: state.inbox.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })) };
    case 'RESET':
      return initialState;
    default:
      throw new Error(`Неизвестное действие: ${action.type}`);
  }
}

export function NotificationProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { isAuthenticated, user } = useAuth();
  const { socket } = useSocket();

  const notify = useCallback((text, kind = 'info', options = {}) => {
    const id = nextId++;
    dispatch({ type: 'TOAST_ADD', toast: { id, text, kind, ...options } });
    setTimeout(() => dispatch({ type: 'TOAST_REMOVE', id }), options.duration || 5000);
  }, []);

  // Загрузка уже отправленных напоминаний при входе
  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: 'RESET' });
      return;
    }
    remindersApi.list({ status: 'sent' })
      .then((items) => dispatch({ type: 'INBOX_SET', items }))
      .catch(() => {});
  }, [isAuthenticated]);

  // События сервера в реальном времени
  useEffect(() => {
    if (!socket) return undefined;
    const handlers = {
      'reminder:due': (reminder) => {
        dispatch({ type: 'INBOX_ADD', item: reminder });
        notify(`Напоминание: «${reminder.event?.title}» начнется скоро`, 'reminder', { duration: 10000, link: `/events/${reminder.event?.id}` });
      },
      'event:created': ({ event, by }) => {
        if (by !== user?.name) notify(`Новое мероприятие: «${event.title}»`, 'info', { link: `/events/${event.id}` });
      },
      'registration:created': ({ name, title, seatsLeft }) => {
        if (name !== user?.name) notify(`${name} зарегистрировался на «${title}»${seatsLeft !== null ? `, мест: ${seatsLeft}` : ''}`);
      },
    };
    Object.entries(handlers).forEach(([e, fn]) => socket.on(e, fn));
    return () => Object.entries(handlers).forEach(([e, fn]) => socket.off(e, fn));
  }, [socket, notify, user]);

  const value = useMemo(() => ({
    toasts: state.toasts,
    inbox: state.inbox,
    unreadCount: state.inbox.filter((i) => !i.readAt).length,
    notify,
    dismiss: (id) => dispatch({ type: 'TOAST_REMOVE', id }),
    markRead: (id) => {
      dispatch({ type: 'INBOX_READ', id });
      remindersApi.update(id, { read: true }).catch(() => {});
    },
    markAllRead: () => {
      dispatch({ type: 'INBOX_READ_ALL' });
      remindersApi.readAll().catch(() => {});
    },
  }), [state, notify]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications используется вне NotificationProvider');
  return ctx;
}

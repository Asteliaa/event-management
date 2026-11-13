import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { notificationsApi } from '../api/index.js';
import { notificationText } from '../utils/notifications.js';
import { useAuth } from './AuthContext.jsx';
import { useSocket } from './SocketContext.jsx';

const NotificationContext = createContext(null);

// Глобальное состояние уведомлений на useReducer:
// toasts – всплывающие сообщения, inbox – последние уведомления из истории (сервер хранит их в БД),
// unread – число непрочитанных по данным сервера
const initialState = { toasts: [], inbox: [], unread: 0 };
let nextId = 1;

function reducer(state, action) {
  switch (action.type) {
    case 'TOAST_ADD':
      return { ...state, toasts: [...state.toasts.slice(-3), action.toast] };
    case 'TOAST_REMOVE':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case 'INBOX_SET':
      return { ...state, inbox: action.items, unread: action.unread };
    case 'INBOX_ADD':
      if (state.inbox.some((i) => i.id === action.item.id)) return state;
      return { ...state, inbox: [action.item, ...state.inbox].slice(0, 20), unread: state.unread + (action.item.readAt ? 0 : 1) };
    case 'INBOX_READ': {
      const wasUnread = state.inbox.some((i) => i.id === action.id && !i.readAt);
      return {
        ...state,
        inbox: state.inbox.map((i) => (i.id === action.id ? { ...i, readAt: i.readAt || new Date().toISOString() } : i)),
        unread: Math.max(state.unread - (wasUnread ? 1 : 0), 0),
      };
    }
    case 'INBOX_READ_ALL':
      return { ...state, inbox: state.inbox.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })), unread: 0 };
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

  // Последние уведомления из истории – при входе и после переподключения сокета
  // (пока соединения не было, уведомления копились на сервере)
  const loadInbox = useCallback(() => notificationsApi.list({ limit: 20 })
    .then((res) => dispatch({ type: 'INBOX_SET', items: res.data, unread: res.meta.unread }))
    .catch(() => {}), []);

  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: 'RESET' });
      return;
    }
    loadInbox();
  }, [isAuthenticated, loadInbox]);

  // События сервера в реальном времени
  useEffect(() => {
    if (!socket) return undefined;
    const handlers = {
      connect: loadInbox,
      'notification:new': (item) => {
        dispatch({ type: 'INBOX_ADD', item });
        notify(notificationText(item), item.type === 'reminder' ? 'reminder' : 'info', { duration: 10000, link: item.event && `/events/${item.event.id}` });
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
  }, [socket, notify, user, loadInbox]);

  const value = useMemo(() => ({
    toasts: state.toasts,
    inbox: state.inbox,
    unreadCount: state.unread,
    reloadInbox: loadInbox,
    notify,
    dismiss: (id) => dispatch({ type: 'TOAST_REMOVE', id }),
    markRead: (id) => {
      dispatch({ type: 'INBOX_READ', id });
      notificationsApi.setRead(id, true).catch(() => {});
    },
    markAllRead: () => {
      dispatch({ type: 'INBOX_READ_ALL' });
      notificationsApi.readAll().catch(() => {});
    },
  }), [state, notify, loadInbox]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications используется вне NotificationProvider');
  return ctx;
}

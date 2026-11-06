import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext({ socket: null, connected: false, online: [] });

// Socket.IO работает на том же сервере, что и REST API, но без пути /api/v1
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || new URL(API_URL, window.location.origin).origin;

// Одно соединение на приложение для вошедшего пользователя; JWT передается при рукопожатии
export function SocketProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState([]);

  useEffect(() => {
    if (!isAuthenticated || !token) return undefined;
    const s = io(SOCKET_URL, { auth: { token }, reconnectionAttempts: 10 });
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));
    s.on('users:online', setOnline);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setOnline([]);
    };
  }, [token, isAuthenticated]);

  return <SocketContext.Provider value={{ socket, connected, online }}>{children}</SocketContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => useContext(SocketContext);

import { useEffect, useState } from 'react';
import { createSocket } from '../socket.js';

// Соединение Socket.IO для вошедшего пользователя.
// При смене токена (вход другим пользователем, выход) старое соединение закрывается
export function useSocket(token) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    const s = createSocket(token);
    setSocket(s);

    s.on('connect', () => {
      setConnected(true);
      setError('');
    });
    // Разрыв: сеть, перезапуск сервера; клиент сам переподключится
    s.on('disconnect', () => setConnected(false));
    // Сервер отклонил подключение (например, токен истек) или недоступен
    s.on('connect_error', (err) => {
      setConnected(false);
      setError(err.message === 'xhr poll error' || err.message === 'websocket error'
        ? 'сервер недоступен'
        : err.message);
    });

    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  return { socket, connected, error };
}

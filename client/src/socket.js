import { io } from 'socket.io-client';

// Socket.IO работает на том же сервере, что и REST API, но без префикса /api
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  new URL(import.meta.env.VITE_API_URL || 'http://localhost:3000/api').origin;

// Новое соединение для пользователя: JWT передается при рукопожатии (handshake.auth)
export function createSocket(token) {
  return io(SOCKET_URL, {
    auth: { token },
    reconnectionAttempts: 10, // после 10 неудачных попыток клиент перестает переподключаться
  });
}

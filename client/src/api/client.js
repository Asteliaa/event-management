import axios from 'axios';

// Базовый адрес REST API v1 из client/.env (VITE_API_URL)
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const TOKEN_KEY = 'eventhub:token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

// Перехватчик запроса: к каждому запросу добавляется JWT из localStorage
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Перехватчик ответа: при 401 (токен истек) сообщаем приложению, чтобы выйти из учетной записи
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && tokenStorage.get()) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  },
);

// Текст ошибки для пользователя из единого формата ответа сервера { error: { message, details } }
export function getErrorMessage(error) {
  if (axios.isCancel(error)) return '';
  if (!error?.response) return 'Сервер недоступен. Проверьте подключение к интернету.';
  const { status, data } = error.response;
  const details = data?.error?.details;
  if (details?.length) return details.map((d) => d.message).join('; ');
  return data?.error?.message || `Ошибка сервера (${status})`;
}

export const getFieldErrors = (error) =>
  Object.fromEntries((error?.response?.data?.error?.details || [])
    .map((d) => [d.field.replace(/^body\./, ''), d.message]));

export default api;

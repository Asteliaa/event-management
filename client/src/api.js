import axios from 'axios';

// Адрес API берется из client/.env (VITE_API_URL)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  timeout: 10000,
});

// Перехватчик: к каждому запросу добавляем JWT-токен из localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Сервер хранит дату как timestamp, в интерфейсе нужен вид ГГГГ-ММ-ДД
export const toClient = (event) => ({ ...event, date: event.date ? event.date.slice(0, 10) : '' });

// Данные формы → тело запроса
const toServer = ({ title, type, date, capacity, description }) => ({
  title, type, date, capacity, description,
});

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((res) => res.data.token);

// signal – сигнал AbortController для отмены запроса
export const fetchEvents = (params, signal) =>
  api.get('/events', { params, signal }).then((res) => res.data.map(toClient));

export const addEvent = (event) =>
  api.post('/events', toServer(event)).then((res) => toClient(res.data));

export const updateEvent = (id, event) =>
  api.put(`/events/${id}`, toServer(event)).then((res) => toClient(res.data));

export const deleteEvent = (id) => api.delete(`/events/${id}`);

// Регистрация текущего пользователя на мероприятие (1 билет)
export const registerForEvent = (id) =>
  api.post(`/events/${id}/registrations`, { tickets: 1 }).then((res) => res.data);

// Текст ошибки для пользователя
export function getErrorMessage(error) {
  if (!error.response) return 'Сервер недоступен. Проверьте, что он запущен.';
  const { status, data } = error.response;
  if (status === 401) return 'Нужно войти заново';
  if (status === 403) return 'Недостаточно прав (нужна роль admin)';
  return (data && (data.message || data.error)) || `Ошибка сервера (${status})`;
}

// Данные пользователя из JWT (id, email, role, exp); null, если токена нет или он истек
export function readToken(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

import api, { API_URL } from './client.js';

const data = (res) => res.data;

// Слой доступа к API: компоненты вызывают эти функции и не знают об адресах и axios

export const authApi = {
  login: (body) => api.post('/auth/login', body).then(data),
  register: (body) => api.post('/auth/register', body).then(data),
  me: () => api.get('/auth/me').then(data),
  updateProfile: (body) => api.patch('/auth/me', body).then(data),
  // ответ – новый токен: прежние токены и соединения других сеансов перестают действовать
  changePassword: (body) => api.put('/auth/me/password', body).then(data),
  // деактивация обратима (вход с паролем возвращает аккаунт); удаление необратимо обезличивает данные
  deactivate: (password) => api.post('/auth/me/deactivate', { password }),
  deleteAccount: (password) => api.delete('/auth/me', { data: { password } }),
  myRegistrations: (params) => api.get('/auth/me/registrations', { params }).then(data),
  favorites: () => api.get('/auth/me/favorites').then(data),
  addFavorite: (id) => api.put(`/auth/me/favorites/${id}`),
  removeFavorite: (id) => api.delete(`/auth/me/favorites/${id}`),
};

export const eventsApi = {
  list: (params, signal) => api.get('/events', { params, signal }).then(data),
  cities: () => api.get('/events/cities').then(data),
  get: (id, signal) => api.get(`/events/${id}`, { signal }).then(data),
  similar: (id) => api.get(`/events/${id}/similar`).then(data),
  create: (body) => api.post('/events', body).then(data),
  update: (id, body) => api.patch(`/events/${id}`, body).then(data),
  remove: (id) => api.delete(`/events/${id}`),
  // мероприятия текущего организатора (администратор с all: true – все) и статистика мероприятия
  managed: (params, signal) => api.get('/events/managed', { params, signal }).then(data),
  stats: (id) => api.get(`/events/${id}/stats`).then(data),
  // состояние публикации: черновик → опубликовано → отменено (или обратно в черновик без регистраций)
  publish: (id) => api.post(`/events/${id}/publish`).then(data),
  unpublish: (id) => api.post(`/events/${id}/unpublish`).then(data),
  cancel: (id, reason) => api.post(`/events/${id}/cancel`, { reason: reason || undefined }).then(data),
  register: (id, body) => api.post(`/events/${id}/registrations`, body).then(data),
  participants: (id) => api.get(`/events/${id}/registrations`).then(data),
  participantsCsv: (id) => api.get(`/events/${id}/registrations`, { params: { format: 'csv' }, responseType: 'blob' }).then(data),
  calendarUrl: (id) => `${API_URL}/events/${id}/calendar.ics`,
};

export const registrationsApi = {
  update: (id, body) => api.patch(`/registrations/${id}`, body).then(data),
  // reason – обязательна, если отменяет организатор или администратор
  cancel: (id, reason) => api.delete(`/registrations/${id}`, reason ? { data: { reason } } : undefined).then(data),
};

export const remindersApi = {
  list: (params) => api.get('/reminders', { params }).then(data),
  create: (body) => api.post('/reminders', body).then(data),
  update: (id, body) => api.patch(`/reminders/${id}`, body).then(data),
  remove: (id) => api.delete(`/reminders/${id}`),
};

// История уведомлений (напоминания, перенос, смена места, отмена)
export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }).then(data),
  unreadCount: () => api.get('/notifications/unread-count').then(data),
  setRead: (id, read = true) => api.patch(`/notifications/${id}`, { read }).then(data),
  readAll: () => api.post('/notifications/read-all').then(data),
};

export const categoriesApi = {
  list: () => api.get('/categories').then(data),
  create: (body) => api.post('/categories', body).then(data),
  update: (id, body) => api.patch(`/categories/${id}`, body).then(data),
  remove: (id) => api.delete(`/categories/${id}`),
};

export const adminApi = {
  stats: () => api.get('/admin/stats').then(data),
  users: (params) => api.get('/admin/users', { params }).then(data),
  updateUser: (id, body) => api.patch(`/admin/users/${id}`, body).then(data),
  deactivateUser: (id) => api.post(`/admin/users/${id}/deactivate`).then(data),
  reactivateUser: (id) => api.post(`/admin/users/${id}/reactivate`).then(data),
  // удаление = обезличивание; 409 ORGANIZER_HAS_FUTURE_EVENTS, если есть будущие опубликованные мероприятия
  removeUser: (id) => api.delete(`/admin/users/${id}`),
};

# Event Management: клиентская часть (ЛР5)

React-приложение (Vite), которое работает с REST API этого репозитория
(Express + Sequelize + PostgreSQL + JWT).

## Запуск

1. Сервер (корень репозитория, нужен `.env` с `DATABASE_URL` и `JWT_SECRET`):

   ```bash
   npm install
   npm run dev     # http://localhost:3000, API доступно по /api
   ```

2. Клиент:

   ```bash
   cd client
   npm install
   cp .env.example .env   # VITE_API_URL=http://localhost:3000/api
   npm run dev            # http://localhost:5173
   ```

Изменять список может только пользователь с ролью `admin`. Зарегистрировать
пользователя: `POST /api/auth/register`, затем выдать роль в базе:
`UPDATE "Users" SET role = 'admin' WHERE email = '...';`

## Что реализовано

- `src/api.js` — экземпляр axios, interceptor добавляет `Authorization: Bearer <token>`;
- вход по email и паролю, токен хранится в `localStorage`;
- загрузка списка (GET) со спиннером, сообщением об ошибке и кнопкой «Повторить»;
- добавление (POST), редактирование (PUT) и удаление (DELETE) с оптимистичным
  обновлением и откатом при ошибке;
- дополнительно: поиск на сервере (`GET /events?search=&type=`) с debounce 500 мс,
  устаревший запрос отменяется через `AbortController` (и при размонтировании).

## ЛР7: Socket.IO

После входа клиент открывает соединение Socket.IO (`src/hooks/useSocket.js`,
JWT передается в `auth.token`). В шапке показан статус соединения и число
пользователей онлайн, уведомления сервера выводятся всплывающими окнами
(`src/components/Notifications.jsx`). Кнопка «Чат» открывает чат мероприятия
(`src/components/EventChat.jsx`): история из MongoDB, индикатор «печатает...»,
список участников комнаты. Список мероприятий обновляется в реальном времени,
когда администратор добавляет, изменяет или удаляет мероприятие в другом окне.

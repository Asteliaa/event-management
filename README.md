# Event Management

Разработка платформы для управления мероприятиями (конференции, вебинары, встречи) с системой регистрации и напоминаний

## Структура

```text
server.js
routes/
controllers/
models/
socket/
client/
```

- `server.js` — точка входа: HTTP-сервер, на котором работают Express и Socket.IO
- `routes/` — маршруты API
- `controllers/` — обработчики запросов
- `models/` — модели Mongoose
- `socket/` — сервер Socket.IO (ЛР7)
- `client/` — React-клиент (Vite)

## ЛР7: реальное время с WebSocket (Socket.IO)

В ветке `lab27` к серверу подключен Socket.IO (тот же порт 3000, что и REST API),
а в React-клиент добавлены чат мероприятия и всплывающие уведомления.

- `socket/index.js` — сервер Socket.IO и обработчики событий
- `socket/auth.js` — проверка JWT при подключении (`io(url, { auth: { token } })`),
  без действительного токена соединение отклоняется (`connect_error`)
- `socket/notify.js` — отправка уведомлений из REST-контроллеров
- `models/message.js` — сообщения чата в MongoDB (коллекция `messages`)
- `client/src/hooks/useSocket.js`, `client/src/components/EventChat.jsx`,
  `client/src/components/Notifications.jsx` — клиентская часть

Что реализовано:

- уведомления о подключении и отключении пользователей и счетчик «онлайн»;
- комнаты: у каждого мероприятия свой чат (`event:<id>`), история последних
  50 сообщений загружается из MongoDB при входе в комнату;
- индикатор «печатает...» (передается только признак набора, без текста);
- подтверждение доставки (acknowledgement), ограничение длины (500 символов)
  и частоты сообщений (5 за 5 секунд);
- уведомления из REST API: создание, изменение и удаление мероприятия
  рассылаются всем, список у всех клиентов обновляется без перезагрузки;
  о регистрации и ее отмене узнают администраторы и участники чата мероприятия.

| Событие | Направление | Данные | Кому |
|---|---|---|---|
| `user:connected` / `user:disconnected` | сервер → клиент | `{ id, email, role }` | всем, кроме самого пользователя |
| `users:online` | сервер → клиент | список пользователей | всем |
| `event:join` | клиент → сервер, ack | `{ eventId }` → `{ ok, event, history, members }` | |
| `event:leave` | клиент → сервер, ack | `{ eventId }` | |
| `room:joined` / `room:left` | сервер → клиент | `{ eventId, user, members }` | участникам комнаты |
| `chat:message` | клиент → сервер, ack | `{ eventId, text }` → `{ ok, message }` или `{ ok: false, error }` | |
| `chat:message` | сервер → клиент | сохраненное сообщение | комнате, кроме отправителя |
| `chat:typing` | клиент ↔ сервер | `{ eventId, isTyping }` | комнате, кроме отправителя |
| `event:created` / `event:updated` / `event:deleted` | сервер → клиент | `{ event, by }`, `{ id, title, by }` | всем |
| `registration:created` / `registration:cancelled` | сервер → клиент | `{ eventId, title, email, tickets, seatsLeft }` | комнате мероприятия и `admins` |

### Запуск (ЛР7)

```bash
npm install
cp .env.example .env   # MONGO_URI и JWT_SECRET
npm run seed           # admin@events.local / admin12345, anna@events.local и ivan@events.local / user12345
npm run dev            # http://localhost:3000: REST API и Socket.IO
cd client
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:3000/api
npm run dev            # http://localhost:5173
```

Для проверки откройте клиент в двух окнах (второе в режиме инкогнито или в другом
браузере), войдите разными пользователями и нажмите «Чат» у одного мероприятия.
Автотесты Socket.IO (`tests/socket.test.js`) запускаются вместе с остальными:
`npm test`.

## ЛР6: MongoDB + Mongoose

В ветке `lab26` хранение данных переведено с PostgreSQL/Sequelize на MongoDB
(Atlas или локальная установка) с ODM Mongoose. Контракт API из ЛР1–ЛР5 сохранен,
React-клиент работает без изменений (`_id` отдается как `id`).

- `db.js` — подключение по `MONGO_URI`
- `models/event.js` — мероприятие: вложенный объект `location`, массив тегов `tags`,
  массив поддокументов `registrations` (регистрации участников), виртуальные поля
  `seatsTaken`/`seatsLeft`, метод `hasSeats`, статический метод `findUpcomingByTag`
- `models/user.js` — пользователь; при удалении его регистрации удаляются каскадно
- `scripts/seed.js` — демонстрационные данные (`npm run seed`)

| Метод и путь | Доступ | Что делает |
|---|---|---|
| `GET /api/events?search=&type=&tag=&city=` | все | список, фильтр по тегу (массив) и `location.city` (вложенное поле) |
| `GET /api/events/stats` | все | агрегация: мероприятия, участники и билеты по типам |
| `GET /api/events/:id` | все | мероприятие с регистрациями (`populate` пользователей) |
| `POST /api/events` | admin | `Event.create` |
| `PUT /api/events/:id` | admin | `findByIdAndUpdate` |
| `DELETE /api/events/:id` | admin | `findByIdAndDelete`, возвращает удаленный документ |
| `POST /api/events/:id/registrations` | user | регистрация (`push` во вложенный массив) |
| `PATCH /api/events/:id/registrations/:regId` | владелец, admin | изменение элемента массива через `registrations.$` |
| `DELETE /api/events/:id/registrations/:regId` | владелец, admin | удаление элемента массива (`$pull`) |
| `DELETE /api/users/:id` | admin | удаление пользователя с каскадом по регистрациям |

Коллекция запросов для Postman: `postman/ЛР6.postman_collection.json`.

## Запуск (ЛР6)

```bash
npm install
cp .env.example .env # указать MONGO_URI и JWT_SECRET
npm run seed         # демо-данные: admin@events.local / admin12345
npm run dev          # сервер: http://localhost:3000 (API также по префиксу /api)
npm test             # автотесты на временной MongoDB в памяти (mongodb-memory-server)
cd client
npm install
cp .env.example .env
npm run dev          # клиент: http://localhost:5173
```

Переменные сервера (`.env`): `MONGO_URI`, `JWT_SECRET`, необязательные `PORT`
(по умолчанию 3000) и `CLIENT_URL` (адрес клиента для CORS, по умолчанию
`http://localhost:5173`). Подробнее о клиенте — в `client/README.md`.

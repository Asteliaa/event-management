# EventHub — конференции, вебинары и встречи с регистрацией и напоминаниями

Курсовая работа по дисциплине «Интернет-технологии и веб-программирование» (БГУИР), тема №11.
Полнофункциональное SPA-приложение: React + Node.js/Express + MongoDB + JWT + Socket.IO.

## Функциональные модули

| Модуль | Что умеет |
|---|---|
| Аутентификация и профиль | Регистрация, вход (JWT), роли user/admin, смена пароля, редактирование профиля, блокировка |
| Каталог мероприятий | Поиск, фильтры (формат, категория, город, онлайн, даты), сортировка, пагинация, похожие мероприятия |
| Регистрации | Запись с выбором числа билетов, атомарный учет мест, отмена, изменение, файл календаря `.ics` |
| Напоминания | Автоматическое за сутки при регистрации, свои напоминания, планировщик на сервере, доставка через Socket.IO, центр уведомлений |
| Избранное | Добавление мероприятий в избранное |
| Чат и уведомления | Чат участников мероприятия (Socket.IO, история в MongoDB), уведомления в реальном времени |
| Админ-панель | Статистика и графики, CRUD мероприятий и категорий, пользователи, список участников с выгрузкой CSV |

## Технологии

- **Клиент:** React 19, React Router 7, Context API + useReducer, свои хуки (`useFetch`, `useDebounce`), axios, Socket.IO client, Vite, адаптивная верстка (CSS Grid/Flexbox), светлая и темная тема.
- **Сервер:** Node.js 22, Express 4, Mongoose 9, Zod (валидация), JWT, bcrypt, helmet, cors, express-rate-limit, morgan, Socket.IO, Swagger UI.
- **БД:** MongoDB 7 (Atlas или контейнер).
- **Инфраструктура:** Jest + Supertest + mongodb-memory-server, Docker Compose, nginx, GitHub Actions, Render/Netlify.

## Архитектура

```
Браузер (React SPA) ──HTTP /api/v1──▶ Express ──Mongoose──▶ MongoDB
        ▲                              │
        └──────── WebSocket (Socket.IO) ┘  ◀── планировщик напоминаний
```

Сервер разделен на слои: **маршруты → валидация (Zod) → контроллеры → сервисы → модели**.

```
server.js                 точка входа: БД, HTTP + Socket.IO, планировщик
src/
  app.js                  Express: helmet, cors, json, Swagger, /api/v1, обработчик ошибок
  config/                 переменные окружения, подключение к MongoDB
  models/                 User, Category, Event, Registration, Reminder, Message
  validators/             схемы Zod для тела запроса, query и params
  middleware/             auth (JWT, роли), validate, errorHandler, rateLimit
  controllers/            разбор запроса и формирование ответа
  services/               бизнес-логика (регистрации, напоминания, статистика…)
  routes/                 маршруты REST API v1
  socket/                 Socket.IO: авторизация, комнаты, чат, уведомления
  jobs/reminderScheduler  отправка наступивших напоминаний
  utils/                  ApiError, пагинация, CSV, iCalendar
docs/openapi.yaml         документация API (OpenAPI 3)
tests/                    тесты Jest
client/src/
  api/                    axios-клиент с перехватчиками и функции API
  context/                Auth, Theme, Socket, Notification (useReducer)
  hooks/                  useFetch, useDebounce, useDocumentTitle
  routes/                 ProtectedRoute, GuestRoute
  components/             layout, ui, events
  pages/                  страницы, pages/admin – админ-панель (lazy)
  styles/                 токены, база, компоненты, страницы
```

### Модель данных (6 коллекций)

- **User** — name, email (уникальный), passwordHash, role, city, blocked, favorites → Event[]
- **Category** — name, slug, color, description
- **Event** — title, description, type, status, category → Category, organizer → User, startsAt, endsAt, capacity, seatsTaken, location {city, venue, online, url}, tags
- **Registration** — event → Event, user → User, tickets, status (registered/attended/cancelled), comment; уникальная пара (event, user)
- **Reminder** — user → User, event → Event, offsetMinutes, remindAt, kind (auto/custom), status (pending/sent), sentAt, readAt
- **Message** — event → Event, user → User, author, text

### REST API v1

Полная документация: `http://localhost:3000/api/docs`. Ошибки — единый формат `{ "error": { status, code, message, details } }`.

| Метод | URL | Описание | Доступ |
|---|---|---|---|
| POST | /auth/register | Регистрация | все |
| POST | /auth/login | Вход, JWT | все |
| GET / PATCH | /auth/me | Профиль | пользователь |
| PUT | /auth/me/password | Смена пароля | пользователь |
| GET | /auth/me/registrations | Мои регистрации | пользователь |
| GET, PUT, DELETE | /auth/me/favorites[/:id] | Избранное | пользователь |
| GET | /events | Каталог (фильтры, сортировка, пагинация) | все |
| GET | /events/:id | Карточка мероприятия | все |
| GET | /events/:id/similar, /events/:id/calendar.ics, /events/cities | Похожие, календарь, города | все |
| POST / PATCH / DELETE | /events[/:id] | Управление мероприятиями | админ |
| POST | /events/:id/registrations | Регистрация на мероприятие | пользователь |
| GET | /events/:id/registrations[?format=csv] | Участники | админ |
| PATCH / DELETE | /registrations/:id | Изменить / отменить регистрацию | владелец, админ |
| GET / POST | /reminders | Мои напоминания | пользователь |
| PATCH / DELETE | /reminders/:id, POST /reminders/read-all | Изменить, удалить, прочитать | пользователь |
| GET | /categories | Категории | все |
| POST / PATCH / DELETE | /categories[/:id] | Управление категориями | админ |
| GET | /admin/stats | Статистика | админ |
| GET / PATCH / DELETE | /admin/users[/:id] | Пользователи | админ |

## Запуск

Требования: Node.js 20+, MongoDB 7 (локально или Atlas) либо Docker Desktop. Браузер: актуальные Chrome, Firefox, Edge, Safari.

### Вариант 1. Docker (весь стек одной командой)

```bash
git clone https://github.com/Asteliaa/event-management.git
cd event-management
cp .env.example .env              # задать пароли и JWT_SECRET
docker compose up --build -d
docker compose exec backend npm run seed   # демо-данные
```

Приложение: http://localhost, API: http://localhost:5000/api/v1, документация: http://localhost:5000/api/docs, mongo-express: http://localhost:8081.

### Вариант 2. Режим разработки

```bash
npm install
cp .env.example .env              # MONGO_URI, JWT_SECRET
npm run seed                      # демо-данные
npm run dev                       # сервер http://localhost:3000

cd client
npm install
cp .env.example .env              # VITE_API_URL=http://localhost:3000/api/v1
npm run dev                       # клиент http://localhost:5173
```

Демо-учетные записи после `npm run seed`: `admin@events.local / admin12345` (администратор), `anna@events.local / user12345`, `ivan@events.local / user12345`.

### Тесты

```bash
npm test          # Jest + Supertest на временной MongoDB в памяти, с покрытием
cd client && npm run lint && npm run build
```

## Развертывание

- **БД:** MongoDB Atlas, бесплатный кластер M0 → строка `MONGO_URI`.
- **Backend:** Render, файл `render.yaml` (Blueprint). Переменные: `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`.
- **Frontend:** Netlify, base directory `client`, файл `client/netlify.toml`. Переменная `VITE_API_URL=https://<сервис>.onrender.com/api/v1`.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) запускает тесты сервера и сборку клиента при каждом push.

## Лабораторные работы

Курсовая выросла из лабораторных ЛР1–ЛР8, их код сохранен в ветках `lab21`–`lab28`.

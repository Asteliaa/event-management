# EventHub — конференции, вебинары и встречи с регистрацией и напоминаниями

Курсовая работа по дисциплине «Интернет-технологии и веб-программирование» (БГУИР), тема №11.
Полнофункциональное SPA-приложение: React + Node.js/Express + PostgreSQL (Sequelize) + JWT + Socket.IO.

## Функциональные модули

| Модуль | Что умеет |
|---|---|
| Аутентификация и профиль | Регистрация, вход (JWT), роли user/admin, смена пароля, редактирование профиля, блокировка |
| Каталог мероприятий | Поиск, фильтры (формат, категория, город, онлайн, даты), сортировка, пагинация, похожие мероприятия |
| Регистрации | Запись с выбором числа билетов, атомарный учет мест, отмена, изменение, файл календаря `.ics` |
| Напоминания | Автоматическое за сутки при регистрации, свои напоминания, планировщик на сервере, доставка через Socket.IO, центр уведомлений |
| Избранное | Добавление мероприятий в избранное |
| Чат и уведомления | Чат участников мероприятия (Socket.IO, история в PostgreSQL), уведомления в реальном времени |
| Админ-панель | Статистика и графики, CRUD мероприятий и категорий, пользователи, список участников с выгрузкой CSV |

## Технологии

- **Клиент:** React 19, React Router 7, Context API + useReducer, свои хуки (`useFetch`, `useDebounce`), axios, Socket.IO client, Vite, адаптивная верстка (CSS Grid/Flexbox), светлая и темная тема.
- **Сервер:** Node.js 22, Express 4, Sequelize 6 + pg, Umzug (миграции), Zod (валидация), JWT, bcrypt, helmet, cors, express-rate-limit, morgan, Socket.IO, Swagger UI.
- **БД:** PostgreSQL 16 (контейнер Docker или управляемая облачная база).
- **Инфраструктура:** Jest + Supertest на отдельной тестовой PostgreSQL, Docker Compose, nginx, GitHub Actions, Render/Netlify.

## Архитектура

```
Браузер (React SPA) ──HTTP /api/v1──▶ Express ──Sequelize──▶ PostgreSQL
        ▲                              │
        └──────── WebSocket (Socket.IO) ┘  ◀── планировщик напоминаний
```

Сервер разделен на слои: **маршруты → валидация (Zod) → контроллеры → сервисы → модели**.

```
server.js                 точка входа: БД (проверка миграций), HTTP + Socket.IO, планировщик
src/
  app.js                  Express: helmet, cors, json, Swagger, /api/v1, обработчик ошибок
  config/                 переменные окружения
  db/                     подключение Sequelize к PostgreSQL, запуск миграций (Umzug)
  models/                 User, Category, Event, Registration, Reminder, Message, Favorite
  validators/             схемы Zod для тела запроса, query и params
  middleware/             auth (JWT, роли), validate, errorHandler, rateLimit
  controllers/            разбор запроса и формирование ответа
  services/               бизнес-логика (регистрации, напоминания, статистика…)
  routes/                 маршруты REST API v1
  socket/                 Socket.IO: авторизация, комнаты, чат, уведомления
  jobs/reminderScheduler  отправка наступивших напоминаний
  utils/                  ApiError, пагинация, CSV, iCalendar
migrations/               версионируемые миграции схемы БД
scripts/                  migrate.js (миграции), seed.js (демо-данные)
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

### Модель данных (PostgreSQL, 7 таблиц)

Схема создается миграциями (`migrations/`). Первичные ключи — `bigint` (identity), в API, Socket.IO и клиенте передаются строками (`"42"`). Моменты времени — `timestamptz`, теги — `text[]`.

- **users** — name, email (уникальный, в нижнем регистре), password_hash, role (user/admin), city, blocked
- **categories** — name (уникальное), slug (уникальный), color, description
- **events** — title, description, type, status (published/cancelled), category_id → categories, organizer_id → users, starts_at, ends_at, capacity, seats_taken, location_city, location_venue, location_online, location_url, tags; ограничения: `0 ≤ seats_taken ≤ capacity`, окончание позже начала
- **registrations** — event_id → events, user_id → users, tickets (1–10), status (registered/attended/cancelled), comment; уникальная пара (event_id, user_id)
- **reminders** — user_id → users, event_id → events, offset_minutes, remind_at, kind (auto/custom), status (pending/sent), sent_at, read_at; уникальная тройка (user_id, event_id, offset_minutes)
- **messages** — event_id → events, user_id → users (при удалении пользователя — NULL), author, text
- **favorites** — user_id → users, event_id → events (составной первичный ключ)

Счетчик `seats_taken` меняется только в транзакциях вместе с регистрацией, отменой и изменением числа билетов; при удалении мероприятия или пользователя связанные записи удаляет БД (`ON DELETE CASCADE`).

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

Требования: Node.js 20+, PostgreSQL 16 (локально или в Docker) либо Docker Desktop. Браузер: актуальные Chrome, Firefox, Edge, Safari.

> Используйте новую отдельную базу для EventHub. Миграции, тесты и `npm run seed -- --reset` изменяют базу, поэтому не направляйте их на учебные или другие ценные базы. Перед запуском команды печатают адрес базы, к которой подключаются.

### Вариант 1. Docker (весь стек одной командой)

```bash
git clone https://github.com/Asteliaa/event-management.git
cd event-management
git checkout coursework/postgres
cp .env.example .env              # задать POSTGRES_PASSWORD, JWT_SECRET, SEED_ADMIN_PASSWORD
docker compose up --build -d      # backend применяет миграции перед стартом
docker compose exec backend npm run seed   # демо-данные (только в пустую базу)
```

Приложение: http://localhost, API: http://localhost:5000/api/v1, документация: http://localhost:5000/api/docs.
PostgreSQL работает во внутренней сети Compose без публикации порта; консоль: `docker compose exec postgres psql -U eventhub eventhub`. Данные хранятся в томе `event-management_pg-data`.
Тома прежней версии на MongoDB (`event-management_mongo-data`) эта конфигурация не использует и не удаляет.

### Вариант 2. Режим разработки

```bash
npm install
cp .env.example .env              # DATABASE_URL, JWT_SECRET
npm run db:migrate                # применить миграции (status – состояние, down – откат последней)
npm run seed                      # демо-данные (только в пустую базу; -- --reset очищает таблицы)
npm run dev                       # сервер http://localhost:3000

cd client
npm install
cp .env.example .env              # VITE_API_URL=http://localhost:3000/api/v1
npm run dev                       # клиент http://localhost:5173
```

Сервер не запускается, если в базе применены не все миграции, и подсказывает команду `npm run db:migrate`.

Демо-учетные записи после `npm run seed` (данные вымышленные, домен `demo.eventhub.local`): `admin@demo.eventhub.local / admin12345` (администратор), `anna@demo.eventhub.local / user12345`, `ivan@demo.eventhub.local / user12345`, `olga@demo.eventhub.local / user12345`.

### Тесты

Тестам нужна отдельная база, имя которой оканчивается на `_test` (иначе тесты откажутся запускаться): перед прогоном ее схема пересоздается из миграций, после каждого теста таблицы очищаются.

```bash
# временная тестовая PostgreSQL в Docker (удаляется при остановке, пароль только для тестов)
docker run --rm -d --name eventhub-test-db -e POSTGRES_USER=eventhub -e POSTGRES_PASSWORD=test_only \
  -e POSTGRES_DB=eventhub_test -p 127.0.0.1:5434:5432 postgres:16-alpine
TEST_DATABASE_URL=postgres://eventhub:test_only@127.0.0.1:5434/eventhub_test npm test
docker stop eventhub-test-db

cd client && npm run lint && npm run build
```

## Развертывание

Провайдер развертывания курсовой на PostgreSQL окончательно не выбран; файлы ниже описывают вариант Render + Netlify.

- **БД:** управляемая PostgreSQL → строка `DATABASE_URL` (для облачных баз с SSL — `DB_SSL=true`).
- **Backend:** Render, файл `render.yaml` (Blueprint): перед стартом применяются миграции. Переменные: `DATABASE_URL`, `DB_SSL`, `JWT_SECRET`, `CLIENT_URL`.
- **Frontend:** Netlify, base directory `client`, файл `client/netlify.toml`. Переменная `VITE_API_URL=https://<сервис>.onrender.com/api/v1`.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) запускает тесты сервера на временной PostgreSQL и lint + сборку клиента при каждом push.

## Лабораторные работы

Курсовая выросла из лабораторных ЛР1–ЛР8, их код сохранен в ветках `lab21`–`lab28`.

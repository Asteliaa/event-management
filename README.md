# EventHub — конференции, вебинары и встречи с регистрацией и напоминаниями

Курсовая работа по дисциплине «Интернет-технологии и веб-программирование» (БГУИР), тема №11.
Полнофункциональное SPA-приложение: React + Node.js/Express + PostgreSQL (Sequelize) + JWT + Socket.IO.
Вне объема: лист ожидания, QR-билеты, отзывы, оплата, доставка по email.

## Функциональные модули

| Модуль | Что умеет |
|---|---|
| Аутентификация и аккаунт | Регистрация, вход (JWT), роли участник / организатор / администратор, смена пароля (завершает другие сеансы), деактивация и удаление аккаунта с подтверждением паролем |
| Каталог мероприятий | Только опубликованные мероприятия: поиск, фильтры (формат, категория, город, онлайн, даты), сортировка, пагинация, похожие мероприятия |
| Жизненный цикл мероприятия | Черновик → опубликовано → отменено (с причиной); перенос с версией расписания; срок и закрытие регистрации; часовой пояс мероприятия |
| Регистрации | Одна регистрация – одно место, атомарный учет мест, отмена и повторная запись (история сохраняется), отметка посещения, файл календаря `.ics` |
| Напоминания и уведомления | Автоматическое напоминание за сутки и свои напоминания, пересчет при переносе, история уведомлений с пагинацией и отметками прочтения; Socket.IO только ускоряет доставку |
| Организатор | Свои мероприятия: создание, редактирование, публикация, отмена, участники с email и выгрузкой CSV, статистика |
| Чат | Чат участников мероприятия (Socket.IO, история в PostgreSQL); права проверяются на каждом сообщении, после отмены мероприятия – только чтение |
| Админ-панель | Статистика, все мероприятия, категории, пользователи: роль, блокировка, деактивация, удаление (обезличивание) |

### Роли и права

| Действие | Гость | Участник | Организатор | Администратор |
|---|---|---|---|---|
| Каталог и карточка опубликованного мероприятия | да | да | да | да |
| Регистрация, напоминания, избранное, уведомления | – | да | да | да |
| Ссылка подключения онлайн-мероприятия | – | при активной регистрации на опубликованное | свои мероприятия | все |
| Чат мероприятия | – | при активной регистрации (после отмены мероприятия – чтение) | свои мероприятия | все |
| Создание, публикация, перенос, отмена мероприятия | – | – | свои | все |
| Участники (с email) и CSV, статистика мероприятия | – | – | свои | все |
| Отмена чужой регистрации, отметка посещения | – | – | на своих мероприятиях | все |
| Передача мероприятия другому организатору | – | – | – | да |
| Категории, пользователи, общая статистика | – | – | – | да |

Права проверяются на сервере (REST и Socket.IO, включая уже открытые соединения); клиент только скрывает недоступные действия.

### Блокировка, деактивация и удаление аккаунта

Это три разных действия:

- **Блокировка** (администратор) – обратима: вход и запросы запрещены, данные не меняются.
- **Деактивация** (сам пользователь с паролем или администратор) – обратима: данные и регистрации сохраняются, напоминания не отправляются. Деактивацию самим пользователем отменяет вход с паролем, деактивацию администратором – только администратор.
- **Удаление** (сам пользователь с паролем или администратор) – необратимое обезличивание; строка `users` остается, чтобы история не удалялась каскадом. Очищаются: имя («Удаленный пользователь»), email и город, пароль (заменяется случайным), тексты сообщений в чатах («Сообщение удалено»), комментарии к регистрациям; будущие регистрации отменяются с освобождением мест, ожидающие напоминания отменяются, уведомления и избранное удаляются, черновики без регистраций удаляются. Прошедшие регистрации остаются в статистике без личных данных. Резервные копии БД и журналы внешних систем этим не покрываются. Организатора с будущими опубликованными мероприятиями удалить нельзя (409), пока они не переданы или не отменены.

Во всех трех случаях, а также при смене роли или пароля, увеличивается `token_version`: ранее выданные JWT и открытые Socket.IO-соединения перестают действовать.

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
  models/                 User, Category, Event, Registration, Reminder, Notification, Message, Favorite
  validators/             схемы Zod для тела запроса, query и params
  middleware/             auth (JWT, роли), validate, errorHandler, rateLimit
  controllers/            разбор запроса и формирование ответа
  services/               бизнес-логика (регистрации, напоминания, уведомления, аккаунт, доступ к чату…)
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
  pages/                  страницы, pages/organizer – кабинет организатора, pages/admin – админ-панель (lazy)
  styles/                 токены, база, компоненты, страницы
```

### Модель данных (PostgreSQL, 8 таблиц)

Схема создается миграциями (`migrations/`), диаграмма связей – [docs/er.md](docs/er.md). Первичные ключи – `bigint` (identity), в API, Socket.IO и клиенте передаются строками (`"42"`). Моменты времени – `timestamptz`, теги – `text[]`.

- **users** – name, email (уникальный, в нижнем регистре; пустой только у удаленных), password_hash, role (user/organizer/admin), city, blocked + blocked_at, status (active/deactivated/deleted), deactivated_at/by, deleted_at, token_version
- **categories** – name (уникальное), slug (уникальный), color, description
- **events** – title, description, type, status (draft/published/cancelled), timezone (IANA), category_id → categories, organizer_id → users, starts_at, ends_at (обязательны для опубликованных), capacity, seats_taken, registration_open, registration_deadline (не позже начала), schedule_version, published_at, cancelled_at, cancel_reason, location_city/venue/online/url, tags
- **registrations** – event_id → events, user_id → users, status (registered/attended/cancelled), cancelled_at, cancelled_by (user/organizer/admin/system), comment, legacy_tickets (число билетов до перехода на «одна регистрация – одно место»); у пользователя не больше одной активной регистрации на мероприятие (частичный уникальный индекс), отмененные хранятся в истории
- **reminders** – registration_id → registrations, user_id, event_id, offset_minutes, remind_at, kind (auto/custom), status (pending/sent/cancelled/skipped), cancel_reason, schedule_version, sent_at
- **notifications** – user_id → users, type (reminder, event_rescheduled, event_location_changed, event_cancelled, registration_cancelled), event_id, registration_id, reminder_id, payload (jsonb, без личных данных и ссылки подключения), dedup_key (уникален вместе с user_id), read_at
- **messages** – event_id → events, user_id → users, author, text, deleted_at
- **favorites** – user_id → users, event_id → events (составной первичный ключ)

Счетчик `seats_taken` меняется только в транзакциях вместе с регистрацией и отменой. Уведомления пишутся в БД в той же транзакции, что и изменение (отметка «отправлено» у напоминания, перенос, отмена), и рассылаются через Socket.IO после фиксации; повтор исключает ключ `(user_id, dedup_key)`. Пользователи не удаляются физически (обезличивание), поэтому каскадное удаление истории не происходит.

### REST API v1

Полная документация: `http://localhost:3000/api/docs` (`docs/openapi.yaml`). Ошибки – единый формат `{ "error": { status, code, message, details } }`.

| Метод | URL | Описание | Доступ |
|---|---|---|---|
| POST | /auth/register, /auth/login | Регистрация, вход (JWT) | все |
| GET / PATCH | /auth/me | Профиль | пользователь |
| PUT | /auth/me/password | Смена пароля, ответ – новый токен | пользователь |
| POST | /auth/me/deactivate | Деактивация (пароль) | пользователь |
| DELETE | /auth/me | Удаление с обезличиванием (пароль) | пользователь |
| GET | /auth/me/registrations | Мои регистрации (`when`, `status`) | пользователь |
| GET, PUT, DELETE | /auth/me/favorites[/:id] | Избранное | пользователь |
| GET | /events, /events/:id | Каталог (опубликованные), карточка | все |
| GET | /events/:id/similar, /events/:id/calendar.ics, /events/cities | Похожие, календарь (без ссылки подключения), города | все |
| GET | /events/managed | Мои мероприятия (администратор с `all=true` – все) | организатор, админ |
| POST | /events | Создание (черновик по умолчанию) | организатор, админ |
| PATCH / DELETE | /events/:id | Изменение, перенос; удаление только черновика | владелец, админ |
| POST | /events/:id/publish, /unpublish, /cancel | Публикация, снятие (без регистраций), отмена с причиной | владелец, админ |
| GET | /events/:id/stats | Статистика мероприятия | владелец, админ |
| POST | /events/:id/registrations | Регистрация на мероприятие | пользователь |
| GET | /events/:id/registrations[?format=csv] | Участники с email | владелец, админ |
| PATCH / DELETE | /registrations/:id | Комментарий / отметка посещения; отмена | участник, владелец мероприятия, админ |
| GET / POST | /reminders | Мои напоминания | пользователь |
| PATCH / DELETE | /reminders/:id | Изменить, удалить | пользователь |
| GET | /notifications, /notifications/unread-count | История уведомлений, число непрочитанных | пользователь |
| PATCH / POST | /notifications/:id, /notifications/read-all | Отметка прочтения | пользователь |
| GET | /categories | Категории | все |
| POST / PATCH / DELETE | /categories[/:id] | Управление категориями | админ |
| GET | /admin/stats | Статистика | админ |
| GET / PATCH | /admin/users[/:id] | Пользователи (`status`), роль и блокировка | админ |
| POST | /admin/users/:id/deactivate, /reactivate | Деактивация и возврат | админ |
| DELETE | /admin/users/:id | Удаление с обезличиванием | админ |

### События Socket.IO

Подключение – с JWT в `auth.token`; токен проверяется вместе с `token_version` и состоянием аккаунта.

| Событие | Направление | Назначение |
|---|---|---|
| `event:join`, `event:leave` | клиент → сервер | Вход в чат (ответ: история, участники, `readOnly`) |
| `chat:message`, `chat:typing` | оба | Сообщение и индикатор набора; права проверяются на каждом сообщении |
| `chat:revoked`, `chat:readonly` | сервер → клиент | Доступ к чату закрыт (отмена участия, передача мероприятия); чат только для чтения (отмена мероприятия) |
| `notification:new` | сервер → клиент | Новое уведомление из истории (личная комната пользователя) |
| `event:created`, `event:updated`, `event:deleted` | сервер → все | Изменения каталога (без ссылки подключения) |
| `registration:created`, `registration:cancelled` | сервер → комната мероприятия и организаторы | Изменение числа участников |

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

Демо-учетные записи после `npm run seed` (данные вымышленные, домен `demo.eventhub.local`): `admin@demo.eventhub.local / admin12345` (администратор), `organizer@demo.eventhub.local / user12345` (организатор), `anna@demo.eventhub.local / user12345`, `ivan@demo.eventhub.local / user12345`, `olga@demo.eventhub.local / user12345`.

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

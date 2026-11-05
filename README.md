# Event Management

Платформа для управления мероприятиями (конференции, вебинары, встречи).

## ЛР2: PostgreSQL и Sequelize

Данные мероприятий хранятся в PostgreSQL, доступ через ORM Sequelize.

```bash
npm install
cp .env.example .env   # указать DATABASE_URL
npm run db:migrate     # таблица Events и поле capacity
npm run db:seed        # демо-данные
npm run dev            # http://localhost:3000
```

В режиме `development` база подключается без SSL (локальный PostgreSQL). Для облачной
базы (Supabase, Neon) запускайте с `NODE_ENV=production`: там SSL включён.

Миграция `add-capacity-to-events` добавляет поле `capacity` через `addColumn`.
Маршруты те же, что в ЛР1: `GET`, `POST /events`, `GET`, `PUT`, `DELETE /events/:id`.

## Структура

- `config/config.json`: настройки подключения
- `migrations/`, `seeders/`: миграции и демо-данные
- `models/`: модели Sequelize
- `routes/`, `controllers/`: маршруты и обработчики

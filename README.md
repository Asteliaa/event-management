# Event Management

Разработка платформы для управления мероприятиями (конференции, вебинары, встречи) с системой регистрации и напоминаний

## Структура

```text
server.js
routes/
controllers/
models/
```

- `server.js` — точка входа и общие middleware
- `routes/` — маршруты API
- `controllers/` — обработчики запросов
- `models/` — модели Sequelize

## Запуск (ЛР5)

```bash
npm install
cp .env.example .env # указать DATABASE_URL и JWT_SECRET
npm run db:migrate
npm run db:seed
npm run dev          # сервер: http://localhost:3000 (API также по префиксу /api)
cd client
npm install
cp .env.example .env
npm run dev          # клиент: http://localhost:5173
```

Переменные сервера (`.env`): `DATABASE_URL`, `JWT_SECRET`, необязательные `PORT`
(по умолчанию 3000) и `CLIENT_URL` (адрес клиента для CORS, по умолчанию
`http://localhost:5173`). Подробнее о клиенте — в `client/README.md`.

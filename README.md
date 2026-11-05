# Event Management

Платформа для управления мероприятиями (конференции, вебинары, встречи).

## ЛР1: серверное приложение на Node.js

REST API для мероприятий на Express, данные хранятся в массиве в памяти.

```bash
npm install
npm run dev   # http://localhost:3000
```

| Метод и путь | Успех | Ошибки |
|---|---|---|
| `GET /events` | 200 | |
| `GET /events/:id` | 200 | 404 |
| `POST /events` | 201 | 400 |
| `PUT /events/:id` | 200 | 400, 404 |
| `DELETE /events/:id` | 204 | 404 |

Обязательные поля: `title`, `type`, `date`. Необязательное: `description`.

## Структура

- `server.js`: точка входа, обработка 404 и ошибок
- `routes/`: маршруты
- `controllers/`: обработчики запросов
- `models/`: данные в памяти

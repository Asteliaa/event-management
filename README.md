# Event Management

Каркас серверного приложения для курсового проекта «Платформа для управления мероприятиями».

## Структура

```text
server.js
routes/
controllers/
models/
```

- `server.js` — точка входа и общие middleware.
- `routes/` — маршруты API.
- `controllers/` — обработчики запросов.
- `models/` — модели и временное хранилище данных.

Следующий этап: реализация CRUD API для ресурса `events`.
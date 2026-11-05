# Event Management

Платформа для управления мероприятиями (конференции, вебинары, встречи).

## ЛР8: контейнеризация с Docker и Docker Compose

В ветке `lab28` все приложение (backend, frontend и MongoDB) запускается одной командой.

| Сервис | Образ | Адрес | Назначение |
|---|---|---|---|
| `frontend` | `client/Dockerfile` (node:22-alpine → nginx:1.27-alpine) | http://localhost | React-клиент; nginx проксирует `/api` и `/socket.io` в backend |
| `backend` | `Dockerfile` (node:22-alpine) | http://localhost:5000 | REST API и Socket.IO, `/health` для healthcheck |
| `mongo` | `mongo:7` | только внутри сети `db` | база данных, том `mongo-data` |
| `mongo-express` | `mongo-express:1` | http://localhost:8081 | веб-интерфейс MongoDB (логин и пароль ME_USER / ME_PASSWORD из `.env`) |

Что настроено сверх обязательного:

- **переменные окружения**: секреты и пароли берутся из `.env` (пример в `.env.example`);
- **healthcheck** у всех сервисов, `depends_on: condition: service_healthy`:
  backend ждет MongoDB, frontend ждет backend;
- **reverse proxy nginx**: браузер обращается только к http://localhost, API и WebSocket
  идут через nginx, поэтому CORS не нужен;
- **mongo-express** для просмотра базы;
- **изоляция сетей**: MongoDB находится во внутренней сети `db` (`internal: true`)
  и не публикует порт на хост;
- backend работает от пользователя `node`, а не от root; `init: true` для корректной остановки.

### Запуск (ЛР8)

Нужен Docker Desktop (Windows/macOS) или Docker Engine с плагином Compose (Linux).

```bash
cp .env.example .env          # задайте свои JWT_SECRET, MONGO_ROOT_PASSWORD, ME_PASSWORD, SEED_ADMIN_PASSWORD
docker compose up --build -d  # то же, что docker-compose up --build в старом синтаксисе
docker compose ps             # все сервисы должны быть в состоянии healthy
docker compose exec backend npm run seed   # демо-данные, админ: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
```

Откройте http://localhost (клиент), http://localhost:5000/health (backend),
http://localhost:8081 (mongo-express). Остановка: `docker compose down`
(данные остаются в томе), `docker compose down -v` удаляет и том с данными.

Полезные команды: `docker compose logs -f backend`, `docker compose exec mongo mongosh -u <MONGO_ROOT_USER> -p` (пароль спросит),
`docker compose exec backend sh`.

### Доступ к Docker Hub из Беларуси

Если образы не скачиваются, в Docker Desktop: Settings → Docker Engine добавьте зеркала
(в Linux тот же JSON в `/etc/docker/daemon.json`, затем `sudo systemctl restart docker`):

```json
{
  "registry-mirrors": ["https://dockerhub.timeweb.cloud", "https://mirror.gcr.io"]
}
```

# Event Management

Платформа для управления мероприятиями (конференции, вебинары, встречи).

## ЛР3: аутентификация и авторизация

JWT, хеширование паролей через bcrypt. Дополнительный механизм: роли (RBAC).

```bash
npm install
cp .env.example .env   # указать DATABASE_URL и JWT_SECRET
npm run db:migrate
npm run db:seed
npm run dev            # http://localhost:3000
npm test               # автотесты, база не нужна
```

| Метод и путь | Доступ | Что делает |
|---|---|---|
| `POST /auth/register` | все | регистрация, 201 или 409 |
| `POST /auth/login` | все | вход, JWT на 1 час |
| `GET /profile` | с токеном | профиль, без токена 401 |
| `GET /users` | admin | список пользователей |
| `GET /events`, `GET /events/:id` | все | чтение мероприятий |
| `POST`, `PUT`, `DELETE /events` | admin | изменение мероприятий |

Роль администратора выдаётся в базе после регистрации:

```sql
UPDATE "Users" SET role = 'admin' WHERE email = '...';
```

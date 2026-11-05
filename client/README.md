# Event Management: клиентская часть

React-приложение (Vite), работает с REST API из этого репозитория (Express, Mongoose, MongoDB, JWT).
Запуск сервера описан в корневом `README.md`.

```bash
cd client
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:3000/api
npm run dev            # http://localhost:5173
```

Изменять список может только пользователь с ролью `admin`, его создаёт `npm run seed`.

## Что реализовано

- `src/api.js`: экземпляр axios, перехватчик добавляет `Authorization: Bearer <token>`;
- вход по email и паролю, токен хранится в `localStorage`;
- загрузка списка со спиннером, сообщением об ошибке и кнопкой «Повторить»;
- добавление, редактирование и удаление с оптимистичным обновлением и откатом при ошибке;
- поиск на сервере с debounce 500 мс, устаревший запрос отменяется через `AbortController`.

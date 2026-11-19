/**
 * Точка входа: запуск HTTP-сервера.
 * Настройки (PORT, DATABASE_URL) читаются из файла .env.
 * Порт по умолчанию – 3000.
 */
require('dotenv').config();
const app = require('./app');
const store = require('./data/events');
const db = require('./data/db');

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log(`EventHub (ПЗ1) запущен: http://localhost:${PORT}`);
  console.log(`Режим организатора: http://localhost:${PORT}/?auth=1`);
  // Проверка базы при запуске. Если база недоступна, сервер все равно работает:
  // страницы покажут понятное сообщение, а после запуска базы заработают без перезапуска сервера.
  store.init()
    .then(() => console.log('PostgreSQL: подключение установлено, таблица events готова'))
    .catch((err) => console.error(`PostgreSQL: ${err.userMessage || err.message}`));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} занят. Запустите с другим портом, например: PORT=3001 npm start`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

// Корректная остановка (Ctrl+C): закрываем соединения с базой
process.on('SIGINT', () => {
  server.close();
  db.close().finally(() => process.exit(0));
});

// Непредвиденные ошибки вне цепочки Express – в журнал, без молчаливого падения
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

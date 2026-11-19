/**
 * Точка входа: запуск HTTP-сервера.
 * Порт можно задать переменной окружения PORT (по умолчанию 3000).
 */
const app = require('./app');

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log(`EventHub (ПЗ1) запущен: http://localhost:${PORT}`);
  console.log(`Режим организатора: http://localhost:${PORT}/?auth=1`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} занят. Запустите с другим портом, например: PORT=3001 npm start`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

// Непредвиденные ошибки вне цепочки Express – в журнал, без молчаливого падения
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

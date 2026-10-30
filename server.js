require('dotenv').config();
const express = require('express');
const cors = require('cors');
const eventRoutes = require('./routes/eventRoutes');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: разрешаем запросы от React-клиента (Vite, порт 5173)
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

// Все маршруты API собраны в один роутер
const api = express.Router();
api.use('/auth', authRoutes);
api.use('/', profileRoutes);
api.use('/events', eventRoutes);

// Клиент обращается по префиксу /api (VITE_API_URL=http://localhost:3000/api),
// старые адреса без префикса (ЛР1–ЛР3) тоже работают
app.use('/api', api);
app.use('/', api);

app.use((req, res, next) => {
    res.status(404).json({ error: "Эндпоинт не найден" });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Сервер запущен на http://localhost:${PORT}`);
    });
}

module.exports = app;
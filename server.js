require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const eventRoutes = require('./routes/eventRoutes');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const connectDB = require('./db');
const createSocketServer = require('./socket');

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

// Сервер начинает принимать запросы только после подключения к MongoDB.
// Express и Socket.IO работают на одном HTTP-сервере и одном порту
if (require.main === module) {
    connectDB()
        .then(() => {
            const server = http.createServer(app);
            createSocketServer(server);
            server.listen(PORT, () => {
                console.log(`Сервер запущен на http://localhost:${PORT} (REST API и Socket.IO)`);
            });
        })
        .catch((err) => {
            console.error('MongoDB connection error:', err.message);
            process.exit(1);
        });
}

module.exports = app;
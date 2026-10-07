require('dotenv').config();
const express = require('express');
const eventRoutes = require('./routes/eventRoutes');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');

const app = express();
const PORT = 3000;

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/', profileRoutes);
app.use('/events', eventRoutes);

app.use((req, res, next) => {
    res.status(404).json({ error: "Эндпоинт не найден" });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
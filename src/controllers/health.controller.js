const mongoose = require('mongoose');

// Проверка состояния: 200, если есть соединение с MongoDB (healthcheck Docker и Render)
module.exports = (req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'error', db: up ? 'up' : 'down', uptime: Math.round(process.uptime()) });
};

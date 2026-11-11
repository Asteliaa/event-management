const { sequelize } = require('../db');

// Проверка состояния: 200, если PostgreSQL отвечает на запрос (healthcheck Docker и Render)
module.exports = async (req, res) => {
    let up = false;
    try {
        await sequelize.query('SELECT 1');
        up = true;
    } catch {
        up = false;
    }
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'error', db: up ? 'up' : 'down', uptime: Math.round(process.uptime()) });
};

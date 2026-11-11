const { Op, QueryTypes } = require('sequelize');
const { sequelize, Event, User, Reminder } = require('../models');

const select = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

// Сводка для панели администратора (агрегирующие запросы SQL)
const overview = async () => {
    const now = new Date();
    const [events, upcoming, users, registrations, remindersSent, byType, byCategory, top, timeline] = await Promise.all([
        Event.count(),
        Event.count({ where: { startsAt: { [Op.gte]: now } } }),
        User.count(),
        select(`SELECT count(*)::int AS count, coalesce(sum(tickets), 0)::int AS tickets
                FROM registrations WHERE status <> 'cancelled'`),
        Reminder.count({ where: { status: 'sent' } }),
        select(`SELECT type, count(*)::int AS events, coalesce(sum(seats_taken), 0)::int AS seats
                FROM events GROUP BY type ORDER BY events DESC, type`),
        select(`SELECT coalesce(c.name, 'Без категории') AS name, coalesce(c.color, '#94a3b8') AS color,
                       count(*)::int AS events, coalesce(sum(e.seats_taken), 0)::int AS seats
                FROM events e LEFT JOIN categories c ON c.id = e.category_id
                GROUP BY c.id, c.name, c.color ORDER BY events DESC, name`),
        Event.findAll({
            where: { startsAt: { [Op.gte]: now } },
            attributes: ['id', 'title', 'startsAt', 'seatsTaken', 'capacity', 'type'],
            order: [['seatsTaken', 'DESC'], ['startsAt', 'ASC'], ['id', 'ASC']],
            limit: 5
        }),
        // регистрации по дням (UTC) за последние 14 дней
        select(`SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, count(*)::int AS count
                FROM registrations WHERE created_at >= :since
                GROUP BY 1 ORDER BY 1`, { since: new Date(now.getTime() - 14 * 864e5) })
    ]);

    return {
        totals: {
            events,
            upcoming,
            users,
            registrations: registrations[0]?.count || 0,
            tickets: registrations[0]?.tickets || 0,
            remindersSent
        },
        byType,
        byCategory,
        topEvents: top,
        timeline
    };
};

module.exports = { overview };

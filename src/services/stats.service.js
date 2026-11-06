const { Event, User, Registration, Reminder } = require('../models');

// Сводка для панели администратора (агрегации MongoDB)
const overview = async () => {
    const now = new Date();
    const [events, upcoming, users, registrations, remindersSent, byType, byCategory, top, timeline] = await Promise.all([
        Event.countDocuments(),
        Event.countDocuments({ startsAt: { $gte: now } }),
        User.countDocuments(),
        Registration.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: null, count: { $sum: 1 }, tickets: { $sum: '$tickets' } } }
        ]),
        Reminder.countDocuments({ status: 'sent' }),
        Event.aggregate([
            { $group: { _id: '$type', events: { $sum: 1 }, seats: { $sum: '$seatsTaken' } } },
            { $project: { _id: 0, type: '$_id', events: 1, seats: 1 } },
            { $sort: { events: -1 } }
        ]),
        Event.aggregate([
            { $group: { _id: '$category', events: { $sum: 1 }, seats: { $sum: '$seatsTaken' } } },
            { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0, events: 1, seats: 1,
                    name: { $ifNull: ['$category.name', 'Без категории'] },
                    color: { $ifNull: ['$category.color', '#94a3b8'] }
                }
            },
            { $sort: { events: -1 } }
        ]),
        Event.find({ startsAt: { $gte: now } }).sort({ seatsTaken: -1 }).limit(5)
            .select('title startsAt seatsTaken capacity type'),
        // регистрации по дням за последние 14 дней
        Registration.aggregate([
            { $match: { createdAt: { $gte: new Date(now.getTime() - 14 * 864e5) } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $project: { _id: 0, date: '$_id', count: 1 } },
            { $sort: { date: 1 } }
        ])
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

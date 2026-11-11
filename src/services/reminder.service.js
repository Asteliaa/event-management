const { Op, QueryTypes } = require('sequelize');
const config = require('../config');
const { sequelize, Reminder, Event } = require('../models');
const ApiError = require('../utils/ApiError');

const remindAtFor = (event, offsetMinutes) => new Date(new Date(event.startsAt).getTime() - offsetMinutes * 60_000);

const includeEvent = {
    association: 'event',
    attributes: ['id', 'title', 'startsAt', 'type', 'locationCity', 'locationVenue', 'locationOnline', 'locationUrl', 'coverUrl', 'status']
};

const withEvent = (id, transaction) => Reminder.findByPk(id, { include: [includeEvent], transaction });

// Автоматическое напоминание при регистрации: за сутки до начала,
// а если до начала меньше суток – за час (если и это время прошло, напоминание не создается).
// Вызывается внутри транзакции регистрации; уже существующее напоминание с тем же интервалом не меняется
const createAuto = async (userId, event, transaction) => {
    const now = Date.now();
    const offset = [config.reminders.defaultOffsetMinutes, 60]
        .find((m) => remindAtFor(event, m).getTime() > now);
    if (offset === undefined) return null;
    await sequelize.query(
        `INSERT INTO reminders (user_id, event_id, offset_minutes, remind_at, kind)
         VALUES (:userId, :eventId, :offset, :remindAt, 'auto')
         ON CONFLICT (user_id, event_id, offset_minutes) DO NOTHING`,
        { replacements: { userId, eventId: event.id, offset, remindAt: remindAtFor(event, offset) }, transaction }
    );
    return Reminder.findOne({ where: { userId, eventId: event.id, offsetMinutes: offset }, transaction });
};

const create = async (userId, { event: eventId, offsetMinutes }) => {
    const event = await Event.findByPk(eventId);
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    const remindAt = remindAtFor(event, offsetMinutes);
    if (remindAt <= new Date()) {
        throw ApiError.badRequest('Время напоминания уже прошло, выберите меньший интервал');
    }
    let reminder;
    try {
        reminder = await Reminder.create({ userId, eventId, offsetMinutes, remindAt });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            throw ApiError.conflict('Такое напоминание уже есть', 'REMINDER_EXISTS');
        }
        throw err;
    }
    return withEvent(reminder.id);
};

const list = async (userId, { status, unread } = {}) => {
    const where = { userId };
    if (status) where.status = status;
    if (unread !== undefined) {
        where.status = 'sent';
        where.readAt = unread ? null : { [Op.ne]: null };
    }
    const direction = status === 'pending' ? 'ASC' : 'DESC';
    return Reminder.findAll({
        where,
        include: [includeEvent],
        order: [['remindAt', direction], ['id', direction]],
        limit: 100
    });
};

const findOwn = async (userId, id) => {
    const reminder = await Reminder.findByPk(id);
    if (!reminder || String(reminder.userId) !== String(userId)) throw ApiError.notFound('Напоминание не найдено');
    return reminder;
};

const update = async (userId, id, { offsetMinutes, read }) => {
    const reminder = await findOwn(userId, id);
    if (offsetMinutes !== undefined) {
        if (reminder.status === 'sent') throw ApiError.badRequest('Напоминание уже отправлено');
        const event = await Event.findByPk(reminder.eventId);
        const remindAt = remindAtFor(event, offsetMinutes);
        if (remindAt <= new Date()) throw ApiError.badRequest('Время напоминания уже прошло');
        Object.assign(reminder, { offsetMinutes, remindAt, kind: 'custom' });
    }
    if (read !== undefined) reminder.readAt = read ? new Date() : null;
    try {
        await reminder.save();
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            throw ApiError.conflict('Такое напоминание уже есть', 'REMINDER_EXISTS');
        }
        throw err;
    }
    return withEvent(reminder.id);
};

const remove = async (userId, id) => {
    const reminder = await findOwn(userId, id);
    await reminder.destroy();
};

const markAllRead = async (userId) => {
    const [count] = await Reminder.update(
        { readAt: new Date() },
        { where: { userId, status: 'sent', readAt: null } }
    );
    return count;
};

// Дата мероприятия изменилась – пересчитываем время неотправленных напоминаний одним запросом
const rescheduleForEvent = (event, transaction) => sequelize.query(
    `UPDATE reminders SET remind_at = :startsAt::timestamptz - make_interval(mins => offset_minutes), updated_at = now()
     WHERE event_id = :eventId AND status = 'pending'`,
    { replacements: { startsAt: event.startsAt, eventId: event.id }, transaction }
);

const removeForUserEvent = (userId, eventId, transaction) =>
    Reminder.destroy({ where: { userId, eventId, status: 'pending' }, transaction });

// Выбирает наступившие напоминания и переводит их в sent одним запросом.
// FOR UPDATE SKIP LOCKED: если запущено несколько экземпляров сервера, одно напоминание
// заберет только один из них, поэтому оно не будет отправлено дважды
const takeDue = async (now = new Date(), batch = 100) => {
    const rows = await sequelize.query(
        `UPDATE reminders r SET status = 'sent', sent_at = :now, updated_at = now()
         WHERE r.id IN (
             SELECT id FROM reminders
             WHERE status = 'pending' AND remind_at <= :now
             ORDER BY remind_at, id
             LIMIT :batch
             FOR UPDATE SKIP LOCKED
         )
         RETURNING r.id`,
        { replacements: { now, batch }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return [];
    return Reminder.findAll({
        where: { id: rows.map((r) => r.id) },
        include: [includeEvent],
        order: [['remindAt', 'ASC'], ['id', 'ASC']]
    });
};

module.exports = {
    createAuto, create, list, update, remove, markAllRead,
    rescheduleForEvent, removeForUserEvent, takeDue, remindAtFor
};

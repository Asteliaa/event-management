const { Op, QueryTypes } = require('sequelize');
const config = require('../config');
const { sequelize, Reminder, Event, Registration } = require('../models');
const ApiError = require('../utils/ApiError');

const remindAtFor = (event, offsetMinutes) => new Date(new Date(event.startsAt).getTime() - offsetMinutes * 60_000);

const includeEvent = {
    association: 'event',
    attributes: ['id', 'title', 'startsAt', 'type', 'locationCity', 'locationVenue', 'locationOnline', 'locationUrl', 'coverUrl', 'status']
};

const withEvent = (id, transaction) => Reminder.findByPk(id, { include: [includeEvent], transaction });

// Автоматическое напоминание при регистрации: за сутки до начала,
// а если до начала меньше суток – за час (если и это время прошло, напоминание не создается).
// Вызывается внутри транзакции регистрации; напоминание относится к этой регистрации
const createAuto = async (registration, event, transaction) => {
    const now = Date.now();
    const offset = [config.reminders.defaultOffsetMinutes, 60]
        .find((m) => remindAtFor(event, m).getTime() > now);
    if (offset === undefined) return null;
    return Reminder.create({
        userId: registration.userId,
        eventId: event.id,
        registrationId: registration.id,
        offsetMinutes: offset,
        remindAt: remindAtFor(event, offset),
        kind: 'auto'
    }, { transaction });
};

// Активная регистрация пользователя на мероприятие: свои напоминания создаются только при ней
const activeRegistration = (userId, eventId, transaction) => Registration.findOne({
    where: { userId, eventId, status: { [Op.ne]: 'cancelled' } }, transaction
});

const create = async (userId, { event: eventId, offsetMinutes }) => {
    const event = await Event.findByPk(eventId);
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    const registration = await activeRegistration(userId, eventId);
    if (!registration) {
        throw ApiError.conflict('Напоминания доступны после регистрации на мероприятие', 'REGISTRATION_REQUIRED');
    }
    if (event.status === 'cancelled') throw ApiError.conflict('Мероприятие отменено', 'EVENT_CANCELLED');
    const remindAt = remindAtFor(event, offsetMinutes);
    if (remindAt <= new Date()) {
        throw ApiError.badRequest('Время напоминания уже прошло, выберите меньший интервал');
    }
    let reminder;
    try {
        reminder = await Reminder.create({ userId, eventId, registrationId: registration.id, offsetMinutes, remindAt });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            throw ApiError.conflict('Такое напоминание уже есть', 'REMINDER_EXISTS');
        }
        throw err;
    }
    return withEvent(reminder.id);
};

// Без фильтра – ожидающие и отправленные (отмененные и пропущенные – только по status)
const list = async (userId, { status, unread } = {}) => {
    const where = { userId, status: status || ['pending', 'sent'] };
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
        if (reminder.status !== 'pending') throw ApiError.badRequest('Изменить можно только ожидающее напоминание');
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

// Удаление пользователем: ожидающее напоминание отменяется (остается в истории), остальные удаляются
const remove = async (userId, id) => {
    const reminder = await findOwn(userId, id);
    if (reminder.status === 'pending') {
        await reminder.update({ status: 'cancelled', cancelReason: 'user' });
    } else {
        await reminder.destroy();
    }
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

// Отмена ожидающих напоминаний регистрации (отмена участия и т. п.)
const cancelForRegistration = (registrationId, reason, transaction) => Reminder.update(
    { status: 'cancelled', cancelReason: reason },
    { where: { registrationId, status: 'pending' }, transaction }
);

// Выбирает наступившие напоминания и переводит их в sent одним запросом.
// FOR UPDATE SKIP LOCKED: если запущено несколько экземпляров сервера, одно напоминание
// заберет только один из них, поэтому оно не будет отправлено дважды.
// Напоминания отмененных мероприятий не отправляются и остаются в статусе pending
// (полноценные уведомления об отмене – отдельная задача следующего этапа)
const takeDue = async (now = new Date(), batch = 100) => {
    const rows = await sequelize.query(
        `UPDATE reminders r SET status = 'sent', sent_at = :now, updated_at = now()
         WHERE r.id IN (
             SELECT rm.id FROM reminders rm
             JOIN events e ON e.id = rm.event_id
             JOIN registrations reg ON reg.id = rm.registration_id
             WHERE rm.status = 'pending' AND rm.remind_at <= :now AND e.status = 'published'
               AND reg.status <> 'cancelled'
             ORDER BY rm.remind_at, rm.id
             LIMIT :batch
             FOR UPDATE OF rm SKIP LOCKED
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
    rescheduleForEvent, cancelForRegistration, takeDue, remindAtFor
};

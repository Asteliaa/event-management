const config = require('../config');
const { Reminder, Event } = require('../models');
const ApiError = require('../utils/ApiError');

const remindAtFor = (event, offsetMinutes) => new Date(new Date(event.startsAt).getTime() - offsetMinutes * 60_000);

const populateEvent = { path: 'event', select: 'title startsAt type location coverUrl status' };

// Автоматическое напоминание при регистрации: за сутки до начала,
// а если до начала меньше суток – за час (если и это время прошло, напоминание не создается)
const createAuto = async (userId, event) => {
    const now = Date.now();
    const offset = [config.reminders.defaultOffsetMinutes, 60]
        .find((m) => remindAtFor(event, m).getTime() > now);
    if (offset === undefined) return null;
    return Reminder.findOneAndUpdate(
        { user: userId, event: event._id, offsetMinutes: offset },
        { $setOnInsert: { remindAt: remindAtFor(event, offset), kind: 'auto' } },
        { upsert: true, returnDocument: 'after' }
    );
};

const create = async (userId, { event: eventId, offsetMinutes }) => {
    const event = await Event.findById(eventId);
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    const remindAt = remindAtFor(event, offsetMinutes);
    if (remindAt <= new Date()) {
        throw ApiError.badRequest('Время напоминания уже прошло, выберите меньший интервал');
    }
    if (await Reminder.exists({ user: userId, event: eventId, offsetMinutes })) {
        throw ApiError.conflict('Такое напоминание уже есть', 'REMINDER_EXISTS');
    }
    const reminder = await Reminder.create({ user: userId, event: eventId, offsetMinutes, remindAt });
    return reminder.populate(populateEvent);
};

const list = async (userId, { status, unread } = {}) => {
    const filter = { user: userId };
    if (status) filter.status = status;
    if (unread !== undefined) {
        filter.status = 'sent';
        filter.readAt = unread ? { $exists: false } : { $exists: true };
    }
    const sort = status === 'pending' ? { remindAt: 1 } : { remindAt: -1 };
    return Reminder.find(filter).sort(sort).limit(100).populate(populateEvent);
};

const findOwn = async (userId, id) => {
    const reminder = await Reminder.findById(id);
    if (!reminder || reminder.user.toString() !== userId) throw ApiError.notFound('Напоминание не найдено');
    return reminder;
};

const update = async (userId, id, { offsetMinutes, read }) => {
    const reminder = await findOwn(userId, id);
    if (offsetMinutes !== undefined) {
        if (reminder.status === 'sent') throw ApiError.badRequest('Напоминание уже отправлено');
        const event = await Event.findById(reminder.event);
        const remindAt = remindAtFor(event, offsetMinutes);
        if (remindAt <= new Date()) throw ApiError.badRequest('Время напоминания уже прошло');
        Object.assign(reminder, { offsetMinutes, remindAt, kind: 'custom' });
    }
    if (read !== undefined) reminder.readAt = read ? new Date() : undefined;
    await reminder.save();
    return reminder.populate(populateEvent);
};

const remove = async (userId, id) => {
    const reminder = await findOwn(userId, id);
    await reminder.deleteOne();
};

const markAllRead = async (userId) => {
    const { modifiedCount } = await Reminder.updateMany(
        { user: userId, status: 'sent', readAt: { $exists: false } },
        { $set: { readAt: new Date() } }
    );
    return modifiedCount;
};

// Дата мероприятия изменилась – пересчитываем время неотправленных напоминаний
const rescheduleForEvent = async (event) => {
    const pending = await Reminder.find({ event: event._id, status: 'pending' });
    await Promise.all(pending.map((r) => {
        r.remindAt = remindAtFor(event, r.offsetMinutes);
        return r.save();
    }));
};

const removeForUserEvent = (userId, eventId) =>
    Reminder.deleteMany({ user: userId, event: eventId, status: 'pending' });

// Выбирает наступившие напоминания и атомарно переводит каждое в sent.
// findOneAndUpdate с условием status: 'pending' гарантирует, что одно напоминание
// не будет отправлено дважды, даже если запущено несколько экземпляров сервера
const takeDue = async (now = new Date(), batch = 100) => {
    const due = [];
    for (let i = 0; i < batch; i += 1) {
        const reminder = await Reminder.findOneAndUpdate(
            { status: 'pending', remindAt: { $lte: now } },
            { $set: { status: 'sent', sentAt: now } },
            { sort: { remindAt: 1 }, returnDocument: 'after' }
        ).populate(populateEvent);
        if (!reminder) break;
        due.push(reminder);
    }
    return due;
};

module.exports = {
    createAuto, create, list, update, remove, markAllRead,
    rescheduleForEvent, removeForUserEvent, takeDue, remindAtFor
};

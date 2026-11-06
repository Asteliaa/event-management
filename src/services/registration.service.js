const { Event, Registration } = require('../models');
const ApiError = require('../utils/ApiError');
const reminderService = require('./reminder.service');

const populateEvent = {
    path: 'event',
    select: 'title type startsAt endsAt location coverUrl status capacity seatsTaken category',
    populate: { path: 'category', select: 'name color' }
};

// Атомарное бронирование мест: условие «хватает мест» проверяется и счетчик увеличивается
// одной операцией findOneAndUpdate, поэтому параллельные запросы не превысят вместимость
const reserveSeats = (eventId, tickets) => Event.findOneAndUpdate(
    {
        _id: eventId,
        status: 'published',
        startsAt: { $gt: new Date() },
        $or: [
            { capacity: { $exists: false } },
            { capacity: null },
            { $expr: { $lte: [{ $add: ['$seatsTaken', tickets] }, '$capacity'] } }
        ]
    },
    { $inc: { seatsTaken: tickets } },
    { returnDocument: 'after' }
);

const releaseSeats = (eventId, tickets) =>
    Event.updateOne({ _id: eventId }, { $inc: { seatsTaken: -tickets } });

// Причина, по которой бронирование не удалось
const explainFailure = async (eventId, tickets) => {
    const event = await Event.findById(eventId);
    if (!event) return ApiError.notFound('Мероприятие не найдено');
    if (event.status === 'cancelled') return ApiError.conflict('Мероприятие отменено', 'EVENT_CANCELLED');
    if (event.startsAt <= new Date()) return ApiError.conflict('Мероприятие уже прошло', 'EVENT_PAST');
    return ApiError.conflict(`Недостаточно мест: запрошено ${tickets}, свободно ${event.seatsLeft}`, 'NO_SEATS');
};

const register = async (eventId, user, { tickets, comment }) => {
    const existing = await Registration.findOne({ event: eventId, user: user.id });
    if (existing && existing.status !== 'cancelled') {
        throw ApiError.conflict('Вы уже зарегистрированы на это мероприятие', 'ALREADY_REGISTERED');
    }

    const event = await reserveSeats(eventId, tickets);
    if (!event) throw await explainFailure(eventId, tickets);

    let registration;
    try {
        if (existing) {
            // повторная регистрация после отмены: та же запись снова становится активной
            Object.assign(existing, { status: 'registered', tickets, comment: comment ?? existing.comment });
            registration = await existing.save();
        } else {
            registration = await Registration.create({ event: eventId, user: user.id, tickets, comment });
        }
    } catch (err) {
        await releaseSeats(eventId, tickets);   // откат брони, если запись не создалась
        if (err.code === 11000) throw ApiError.conflict('Вы уже зарегистрированы на это мероприятие', 'ALREADY_REGISTERED');
        throw err;
    }

    const reminder = await reminderService.createAuto(user.id, event);
    return { registration, event, reminder };
};

const findOrFail = async (id) => {
    const registration = await Registration.findById(id);
    if (!registration) throw ApiError.notFound('Регистрация не найдена');
    return registration;
};

const assertCanManage = (user, registration) => {
    if (user.role !== 'admin' && registration.user.toString() !== user.id) {
        throw ApiError.forbidden('Можно изменять только свою регистрацию');
    }
};

const update = async (id, user, { tickets, status, comment }) => {
    const registration = await findOrFail(id);
    assertCanManage(user, registration);
    if (registration.status === 'cancelled') throw ApiError.conflict('Регистрация отменена', 'REGISTRATION_CANCELLED');
    if (status && status !== 'cancelled' && user.role !== 'admin') {
        throw ApiError.forbidden('Отметку о посещении ставит администратор');
    }
    if (status === 'cancelled') return cancel(id, user);

    if (tickets !== undefined && tickets !== registration.tickets) {
        const delta = tickets - registration.tickets;
        if (delta > 0) {
            const event = await reserveSeats(registration.event, delta);
            if (!event) throw await explainFailure(registration.event, delta);
        } else {
            await releaseSeats(registration.event, -delta);
        }
        registration.tickets = tickets;
    }
    if (status) registration.status = status;
    if (comment !== undefined) registration.comment = comment;
    await registration.save();
    return registration.populate(populateEvent);
};

// Отмена: запись остается со статусом cancelled (история), места освобождаются,
// неотправленные напоминания удаляются
const cancel = async (id, user) => {
    const registration = await findOrFail(id);
    assertCanManage(user, registration);
    if (registration.status === 'cancelled') return registration.populate(populateEvent);
    await releaseSeats(registration.event, registration.tickets);
    registration.status = 'cancelled';
    await registration.save();
    await reminderService.removeForUserEvent(registration.user, registration.event);
    return registration.populate(populateEvent);
};

const listMine = async (userId, { when = 'all' } = {}) => {
    const registrations = await Registration.find({ user: userId, status: { $ne: 'cancelled' } })
        .sort({ createdAt: -1 }).populate(populateEvent);
    const now = new Date();
    // регистрации на удаленные мероприятия не показываем
    return registrations
        .filter((r) => r.event)
        .filter((r) => when === 'all' || (when === 'upcoming' ? r.event.startsAt >= now : r.event.startsAt < now))
        .sort((a, b) => a.event.startsAt - b.event.startsAt);
};

const listForEvent = async (eventId) => {
    if (!await Event.exists({ _id: eventId })) throw ApiError.notFound('Мероприятие не найдено');
    return Registration.find({ event: eventId }).sort({ createdAt: 1 }).populate('user', 'name email');
};

module.exports = { register, update, cancel, listMine, listForEvent, reserveSeats };

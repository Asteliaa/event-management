const { Op, QueryTypes } = require('sequelize');
const { sequelize, Event, Registration } = require('../models');
const ApiError = require('../utils/ApiError');
const reminderService = require('./reminder.service');

const includeEvent = {
    association: 'event',
    attributes: [
        'id', 'title', 'type', 'startsAt', 'endsAt', 'coverUrl', 'status', 'capacity', 'seatsTaken', 'categoryId',
        'locationCity', 'locationVenue', 'locationOnline', 'locationUrl'
    ],
    include: [{ association: 'category', attributes: ['id', 'name', 'color'] }]
};

const withEvent = (id, transaction) => Registration.findByPk(id, { include: [includeEvent], transaction });

// Бронирование мест: условие «мероприятие открыто и хватает мест» проверяется и счетчик увеличивается
// одним UPDATE. Строка мероприятия блокируется до конца транзакции, поэтому параллельные запросы
// выполняются по очереди и не превысят вместимость (дополнительно это гарантирует CHECK в схеме)
const reserveSeats = async (eventId, tickets, transaction) => {
    const [rows] = await sequelize.query(
        `UPDATE events SET seats_taken = seats_taken + :tickets, updated_at = now()
         WHERE id = :eventId AND status = 'published' AND starts_at > now()
           AND (capacity IS NULL OR seats_taken + :tickets <= capacity)
         RETURNING id`,
        { replacements: { eventId, tickets }, transaction }
    );
    if (!rows.length) return null;
    return Event.findByPk(eventId, { transaction });
};

const releaseSeats = (eventId, tickets, transaction) => sequelize.query(
    'UPDATE events SET seats_taken = seats_taken - :tickets, updated_at = now() WHERE id = :eventId',
    { replacements: { eventId, tickets }, transaction, type: QueryTypes.UPDATE }
);

// Причина, по которой бронирование не удалось
const explainFailure = async (eventId, tickets, transaction) => {
    const event = await Event.findByPk(eventId, { transaction });
    if (!event) return ApiError.notFound('Мероприятие не найдено');
    if (event.status === 'cancelled') return ApiError.conflict('Мероприятие отменено', 'EVENT_CANCELLED');
    if (event.startsAt <= new Date()) return ApiError.conflict('Мероприятие уже прошло', 'EVENT_PAST');
    return ApiError.conflict(`Недостаточно мест: запрошено ${tickets}, свободно ${event.seatsLeft}`, 'NO_SEATS');
};

const alreadyRegistered = () => ApiError.conflict('Вы уже зарегистрированы на это мероприятие', 'ALREADY_REGISTERED');

// Регистрация: бронь мест, запись регистрации и автоматическое напоминание – одна транзакция.
// Любая ошибка откатывает все три изменения, поэтому счетчик мест всегда равен сумме билетов
const register = (eventId, user, { tickets, comment }) => sequelize.transaction(async (transaction) => {
    const existing = await Registration.findOne({ where: { eventId, userId: user.id }, transaction });
    if (existing && existing.status !== 'cancelled') throw alreadyRegistered();

    const event = await reserveSeats(eventId, tickets, transaction);
    if (!event) throw await explainFailure(eventId, tickets, transaction);

    let registration;
    if (existing) {
        // повторная регистрация после отмены: та же запись снова становится активной.
        // Условие status = 'cancelled' защищает от двух одновременных повторных регистраций
        const [count] = await Registration.update(
            { status: 'registered', tickets, comment: comment ?? existing.comment },
            { where: { id: existing.id, status: 'cancelled' }, transaction }
        );
        if (!count) throw alreadyRegistered();
        registration = await Registration.findByPk(existing.id, { transaction });
    } else {
        try {
            // вложенная транзакция (SAVEPOINT): ошибка UNIQUE не прерывает внешнюю транзакцию
            registration = await sequelize.transaction({ transaction }, (t) =>
                Registration.create({ eventId, userId: user.id, tickets, comment: comment ?? '' }, { transaction: t }));
        } catch (err) {
            if (err.name === 'SequelizeUniqueConstraintError') throw alreadyRegistered();
            throw err;
        }
    }

    const reminder = await reminderService.createAuto(user.id, event, transaction);
    return { registration, event, reminder };
});

const findOrFail = async (id, transaction) => {
    // FOR UPDATE: изменение и отмена одной регистрации выполняются по очереди
    const registration = await Registration.findByPk(id, { transaction, lock: transaction?.LOCK.UPDATE });
    if (!registration) throw ApiError.notFound('Регистрация не найдена');
    return registration;
};

const assertCanManage = (user, registration) => {
    if (user.role !== 'admin' && String(registration.userId) !== String(user.id)) {
        throw ApiError.forbidden('Можно изменять только свою регистрацию');
    }
};

// Отмена: запись остается со статусом cancelled (история), места освобождаются,
// неотправленные напоминания удаляются – в одной транзакции
const cancelInTransaction = async (id, user, transaction) => {
    const registration = await findOrFail(id, transaction);
    assertCanManage(user, registration);
    if (registration.status !== 'cancelled') {
        await releaseSeats(registration.eventId, registration.tickets, transaction);
        await registration.update({ status: 'cancelled' }, { transaction });
        await reminderService.removeForUserEvent(registration.userId, registration.eventId, transaction);
    }
    return registration.id;
};

const cancel = async (id, user) => {
    const regId = await sequelize.transaction((t) => cancelInTransaction(id, user, t));
    return withEvent(regId);
};

const update = async (id, user, { tickets, status, comment }) => {
    const regId = await sequelize.transaction(async (transaction) => {
        const registration = await findOrFail(id, transaction);
        assertCanManage(user, registration);
        if (registration.status === 'cancelled') throw ApiError.conflict('Регистрация отменена', 'REGISTRATION_CANCELLED');
        if (status && status !== 'cancelled' && user.role !== 'admin') {
            throw ApiError.forbidden('Отметку о посещении ставит администратор');
        }
        if (status === 'cancelled') return cancelInTransaction(id, user, transaction);

        // изменение числа билетов: счетчик мест и регистрация меняются вместе
        if (tickets !== undefined && tickets !== registration.tickets) {
            const delta = tickets - registration.tickets;
            if (delta > 0) {
                const event = await reserveSeats(registration.eventId, delta, transaction);
                if (!event) throw await explainFailure(registration.eventId, delta, transaction);
            } else {
                await releaseSeats(registration.eventId, -delta, transaction);
            }
            registration.tickets = tickets;
        }
        if (status) registration.status = status;
        if (comment !== undefined) registration.comment = comment;
        await registration.save({ transaction });
        return registration.id;
    });
    return withEvent(regId);
};

const listMine = async (userId, { when = 'all' } = {}) => {
    const where = { userId, status: { [Op.ne]: 'cancelled' } };
    const now = new Date();
    const eventWhere = when === 'upcoming' ? { startsAt: { [Op.gte]: now } }
        : when === 'past' ? { startsAt: { [Op.lt]: now } } : undefined;
    return Registration.findAll({
        where,
        include: [{ ...includeEvent, where: eventWhere, required: true }],
        order: [[{ model: Event, as: 'event' }, 'startsAt', 'ASC'], ['createdAt', 'DESC']]
    });
};

const listForEvent = async (eventId) => {
    if (!await Event.count({ where: { id: eventId } })) throw ApiError.notFound('Мероприятие не найдено');
    return Registration.findAll({
        where: { eventId },
        include: [{ association: 'user', attributes: ['id', 'name', 'email'] }],
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
    });
};

module.exports = { register, update, cancel, listMine, listForEvent, reserveSeats };

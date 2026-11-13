const { Op } = require('sequelize');
const { sequelize, Event, Registration } = require('../models');
const ApiError = require('../utils/ApiError');
const reminderService = require('./reminder.service');
const notificationService = require('./notification.service');
const { canManageEvent, isAdmin } = require('./access');

// Одна регистрация – одно место. Счетчик events.seats_taken всегда равен числу активных
// (не cancelled) регистраций: он меняется только здесь, в одной транзакции с регистрацией или отменой

const includeEvent = {
    association: 'event',
    attributes: [
        'id', 'title', 'type', 'startsAt', 'endsAt', 'coverUrl', 'status', 'capacity', 'seatsTaken', 'categoryId',
        'organizerId', 'locationCity', 'locationVenue', 'locationOnline', 'locationUrl'
    ],
    include: [{ association: 'category', attributes: ['id', 'name', 'color'] }]
};

const withEvent = (id, transaction) => Registration.findByPk(id, { include: [includeEvent], transaction });

// Бронирование места: условие «регистрация доступна и есть место» проверяется и счетчик увеличивается
// одним UPDATE. Строка мероприятия блокируется до конца транзакции, поэтому параллельные запросы
// выполняются по очереди и не превысят вместимость (дополнительно это гарантирует CHECK в схеме)
const reserveSeat = async (eventId, transaction) => {
    const [rows] = await sequelize.query(
        `UPDATE events SET seats_taken = seats_taken + 1, updated_at = now()
         WHERE id = :eventId AND status = 'published' AND registration_open
           AND starts_at > now() AND (registration_deadline IS NULL OR registration_deadline > now())
           AND (capacity IS NULL OR seats_taken < capacity)
         RETURNING id`,
        { replacements: { eventId }, transaction }
    );
    if (!rows.length) return null;
    return Event.findByPk(eventId, { transaction });
};

const releaseSeat = (eventId, transaction) => sequelize.query(
    'UPDATE events SET seats_taken = seats_taken - 1, updated_at = now() WHERE id = :eventId',
    { replacements: { eventId }, transaction }
);

// Причина, по которой бронирование не удалось
const explainFailure = async (eventId, transaction) => {
    const event = await Event.findByPk(eventId, { transaction });
    if (!event || event.status === 'draft') return ApiError.notFound('Мероприятие не найдено');
    if (event.status === 'cancelled') return ApiError.conflict('Мероприятие отменено', 'EVENT_CANCELLED');
    if (event.startsAt <= new Date()) return ApiError.conflict('Мероприятие уже началось или прошло', 'EVENT_PAST');
    if (!event.registrationOpen) return ApiError.conflict('Регистрация закрыта организатором', 'REGISTRATION_CLOSED');
    if (event.registrationDeadline && event.registrationDeadline <= new Date()) {
        return ApiError.conflict('Срок регистрации истек', 'REGISTRATION_DEADLINE_PASSED');
    }
    return ApiError.conflict('Свободных мест нет', 'NO_SEATS');
};

const alreadyRegistered = () => ApiError.conflict('Вы уже зарегистрированы на это мероприятие', 'ALREADY_REGISTERED');

// Регистрация: бронь места, новая запись регистрации и автоматическое напоминание – одна транзакция.
// Повторная запись после отмены создает новую регистрацию; две одновременные попытки
// не создадут две активные записи – их разделяет частичный уникальный индекс
const register = (eventId, user, { comment } = {}) => sequelize.transaction(async (transaction) => {
    const active = await Registration.count({
        where: { eventId, userId: user.id, status: { [Op.ne]: 'cancelled' } }, transaction
    });
    if (active) throw alreadyRegistered();

    const event = await reserveSeat(eventId, transaction);
    if (!event) throw await explainFailure(eventId, transaction);

    let registration;
    try {
        // вложенная транзакция (SAVEPOINT): ошибка UNIQUE не прерывает внешнюю транзакцию
        registration = await sequelize.transaction({ transaction }, (t) =>
            Registration.create({ eventId, userId: user.id, comment: comment ?? '' }, { transaction: t }));
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') throw alreadyRegistered();
        throw err;
    }

    const reminder = await reminderService.createAuto(registration, event, transaction);
    return { registration, event, reminder };
});

const findOrFail = async (id, transaction) => {
    // FOR UPDATE: изменение и отмена одной регистрации выполняются по очереди
    const registration = await Registration.findByPk(id, { transaction, lock: transaction?.LOCK.UPDATE });
    if (!registration) throw ApiError.notFound('Регистрация не найдена');
    // строка регистрации заблокирована FOR UPDATE: планировщик напоминаний (FOR SHARE ... SKIP LOCKED)
    // пропускает ее напоминания, пока отмена не зафиксирована
    const event = await Event.findByPk(registration.eventId, { transaction, attributes: ['id', 'organizerId', 'status'] });
    return { registration, event };
};

// Кто действует с регистрацией: ее владелец, организатор мероприятия или администратор
const actorFor = (user, registration, event) => {
    if (isAdmin(user)) return 'admin';
    if (canManageEvent(user, event)) return 'organizer';
    if (String(registration.userId) === String(user.id)) return 'user';
    return null;
};

const assertActor = (user, registration, event) => {
    const actor = actorFor(user, registration, event);
    if (!actor) throw ApiError.forbidden('Можно изменять только свою регистрацию');
    return actor;
};

// Отмена: запись остается со статусом cancelled (история), место освобождается,
// ожидающие напоминания этой регистрации отменяются – в одной транзакции
// Если регистрацию отменил организатор или администратор, участник получает уведомление.
// Возвращает id созданных уведомлений (отправляются после фиксации транзакции)
const cancelInTransaction = async (registration, actor, transaction) => {
    if (registration.status === 'cancelled') return [];
    await releaseSeat(registration.eventId, transaction);
    await registration.update({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: actor }, { transaction });
    await reminderService.cancelForRegistration(registration.id, 'registration_cancelled', transaction);
    if (actor === 'user') return [];
    return notificationService.createForUser({
        userId: registration.userId,
        type: 'registration_cancelled',
        eventId: registration.eventId,
        registrationId: registration.id,
        payload: { by: actor },
        dedupKey: `registration:${registration.id}:cancelled`
    }, transaction);
};

const cancel = async (id, user) => {
    const ids = await sequelize.transaction(async (transaction) => {
        const { registration, event } = await findOrFail(id, transaction);
        const who = assertActor(user, registration, event);
        return cancelInTransaction(registration, who, transaction);
    });
    await notificationService.deliver(ids);
    return withEvent(id);
};

// Изменение: участник меняет комментарий; отметку о посещении (attended) ставят
// организатор мероприятия и администратор; status = cancelled – то же, что отмена
const update = async (id, user, { status, comment }) => {
    const ids = await sequelize.transaction(async (transaction) => {
        const { registration, event } = await findOrFail(id, transaction);
        const actor = assertActor(user, registration, event);
        if (registration.status === 'cancelled') throw ApiError.conflict('Регистрация отменена', 'REGISTRATION_CANCELLED');
        if (status === 'cancelled') return cancelInTransaction(registration, actor, transaction);
        if (status && actor === 'user') {
            throw ApiError.forbidden('Отметку о посещении ставит организатор мероприятия или администратор');
        }
        if (comment !== undefined && String(registration.userId) !== String(user.id)) {
            throw ApiError.forbidden('Комментарий может изменить только сам участник');
        }
        if (status) registration.status = status;
        if (comment !== undefined) registration.comment = comment;
        await registration.save({ transaction });
        return [];
    });
    await notificationService.deliver(ids);
    return withEvent(id);
};

// Мои регистрации. По умолчанию – только активные; status=cancelled – история отмен, status=all – все
const listMine = async (userId, { when = 'all', status = 'active' } = {}) => {
    const where = { userId };
    if (status === 'active') where.status = { [Op.ne]: 'cancelled' };
    else if (status === 'cancelled') where.status = 'cancelled';
    const now = new Date();
    const eventWhere = when === 'upcoming' ? { startsAt: { [Op.gte]: now } }
        : when === 'past' ? { startsAt: { [Op.lt]: now } } : undefined;
    return Registration.findAll({
        where,
        include: [{ ...includeEvent, where: eventWhere, required: true }],
        order: [[{ model: Event, as: 'event' }, 'startsAt', 'ASC'], ['createdAt', 'DESC'], ['id', 'DESC']]
    });
};

// Участники мероприятия (организатор-владелец или администратор). Email участников выдается
// только им; по умолчанию – все регистрации, включая отмененные (история)
const listForEvent = async (eventId, user, { status = 'all' } = {}) => {
    const event = await Event.findByPk(eventId, { attributes: ['id', 'organizerId'] });
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    if (!canManageEvent(user, event)) throw ApiError.forbidden('Список участников доступен организатору мероприятия и администратору');
    const where = { eventId };
    if (status === 'active') where.status = { [Op.ne]: 'cancelled' };
    else if (status !== 'all') where.status = status;
    return Registration.findAll({
        where,
        include: [{ association: 'user', attributes: ['id', 'name', 'email'] }],
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
    });
};

module.exports = { register, update, cancel, listMine, listForEvent, reserveSeat };

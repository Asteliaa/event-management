const { Op, QueryTypes } = require('sequelize');
const { sequelize, Event, Registration, Reminder, Favorite, User } = require('../models');
const { assertCanManageEvent, canManageEvent, isAdmin } = require('./access');
const notificationService = require('./notification.service');
const notify = require('../socket/notify');
const ApiError = require('../utils/ApiError');
const { paginate, pageResult, likePattern } = require('../utils/pagination');
const reminderService = require('./reminder.service');

// id добавлен последним ключом, чтобы порядок при равных значениях был стабильным (важно для пагинации)
const SORTS = {
    date: [['startsAt', 'ASC'], ['id', 'ASC']],
    '-date': [['startsAt', 'DESC'], ['id', 'DESC']],
    popular: [['seatsTaken', 'DESC'], ['startsAt', 'ASC'], ['id', 'ASC']],
    new: [['createdAt', 'DESC'], ['id', 'DESC']]
};

const includeCategory = { association: 'category', attributes: ['id', 'name', 'slug', 'color'] };

// Условие WHERE из параметров запроса каталога
// Каталог показывает только опубликованные мероприятия: черновики видят владелец и администратор,
// отмененные доступны по ссылке и в профиле участника
const buildFilter = ({ search, type, category, city, tag, online, from, to, when }) => {
    const and = [{ status: 'published' }];
    if (search) {
        const pattern = likePattern(search);
        and.push({
            [Op.or]: [
                { title: { [Op.iLike]: pattern } },
                { description: { [Op.iLike]: pattern } },
                { tags: { [Op.contains]: [search.toLowerCase()] } }
            ]
        });
    }
    if (type) and.push({ type });
    if (category) and.push({ categoryId: category });
    // город – точное совпадение без учета регистра
    if (city) and.push(sequelize.where(sequelize.fn('lower', sequelize.col('location_city')), city.toLowerCase()));
    if (tag) and.push({ tags: { [Op.contains]: [tag] } });
    if (online !== undefined) and.push(online ? { locationOnline: true } : { locationOnline: { [Op.not]: true } });

    const now = new Date();
    const date = {};
    if (when === 'upcoming') date[Op.gte] = now;
    if (when === 'past') date[Op.lt] = now;
    if (from) date[Op.gte] = date[Op.gte] && date[Op.gte] > from ? date[Op.gte] : from;
    if (to) date[Op.lte] = to;
    if (Object.getOwnPropertySymbols(date).length) and.push({ startsAt: date });
    return { [Op.and]: and };
};

const list = async (query) => {
    const where = buildFilter(query);
    const page = paginate(query);
    const { rows, count } = await Event.findAndCountAll({
        where,
        include: [includeCategory],
        order: SORTS[query.sort],
        offset: page.skip,
        limit: page.limit
    });
    return pageResult(rows, count, page);
};

// Мероприятие для просмотра: черновик существует только для владельца и администратора
const findOrFail = async (id, user) => {
    const event = await Event.findByPk(id, {
        include: [includeCategory, { association: 'organizer', attributes: ['id', 'name'] }]
    });
    if (!event || (event.status === 'draft' && !canManageEvent(user, event))) throw ApiError.notFound('Мероприятие не найдено');
    return event;
};

// Карточка мероприятия; для вошедшего пользователя добавляется его регистрация,
// напоминания и признак «в избранном»
const getById = async (id, user) => {
    const event = await findOrFail(id, user);
    const canManage = canManageEvent(user, event);
    let extra = {};
    if (user) {
        const [registration, reminders, favorite] = await Promise.all([
            Registration.findOne({ where: { eventId: id, userId: user.id, status: { [Op.ne]: 'cancelled' } } }),
            Reminder.findAll({ where: { eventId: id, userId: user.id, status: ['pending', 'sent'] }, order: [['offsetMinutes', 'DESC']] }),
            Favorite.count({ where: { eventId: id, userId: user.id } })
        ]);
        extra = {
            myRegistration: registration ? registration.toJSON() : null,
            myReminders: reminders.map((r) => r.toJSON()),
            isFavorite: favorite > 0
        };
        // ссылка подключения – активному участнику опубликованного мероприятия, пока оно не завершилось
        if (registration && event.status === 'published' && event.phase !== 'finished') event.revealLink();
    }
    if (canManage) event.revealLink();
    return { ...event.toJSON(), canManage, ...extra };
};

// Поля запроса → атрибуты модели (location раскладывается по столбцам, category → categoryId)
const toAttributes = (data) => {
    const attrs = {};
    for (const [key, value] of Object.entries(data)) {
        if (key === 'location') Object.assign(attrs, Event.locationToColumns(value));
        else if (key === 'category') attrs.categoryId = value;
        else if (key === 'organizer') attrs.organizerId = value;
        // null в запросе – очистить необязательное поле; у полей со значением по умолчанию – вернуть его
        else if (value === null && key === 'description') attrs.description = '';
        else if (value === null && key === 'coverUrl') attrs.coverUrl = '';
        else if (value === null && key === 'tags') attrs.tags = [];
        else attrs[key] = value;
    }
    return attrs;
};

// Новый владелец мероприятия (передает администратор): организатор или администратор
const assertOrganizerCandidate = async (userId, transaction) => {
    const owner = await User.findByPk(userId, { transaction, attributes: ['id', 'role', 'blocked'] });
    if (!owner || !['organizer', 'admin'].includes(owner.role)) {
        throw new ApiError(422, 'Ошибка валидации данных', {
            details: [{ field: 'body.organizer', message: 'Владельцем может быть только организатор или администратор' }]
        });
    }
};

const assertOrganizerChange = async (data, user, transaction) => {
    if (data.organizer === undefined) return;
    if (!isAdmin(user)) throw ApiError.forbidden('Передать мероприятие другому организатору может только администратор');
    await assertOrganizerCandidate(data.organizer, transaction);
};

const validationError = (details) => new ApiError(422, 'Ошибка валидации данных', { details });

const LOCATION_ATTRS = ['locationCity', 'locationVenue', 'locationOnline', 'locationUrl'];

// Требования к мероприятию, которое публикуется (или уже опубликовано и изменяется):
// корректные начало и окончание, данные выбранного формата, срок регистрации не позже начала
const publicationErrors = (e) => {
    const details = [];
    if (!e.startsAt) details.push({ field: 'body.startsAt', message: 'Для публикации укажите начало' });
    if (!e.endsAt) details.push({ field: 'body.endsAt', message: 'Для публикации укажите окончание' });
    if (e.startsAt && e.endsAt && e.endsAt <= e.startsAt) {
        details.push({ field: 'body.endsAt', message: 'Окончание должно быть позже начала' });
    }
    if (e.locationOnline && !e.locationUrl) {
        details.push({ field: 'body.location.url', message: 'Для онлайн-мероприятия укажите ссылку подключения' });
    }
    if (!e.locationOnline && !e.locationCity) {
        details.push({ field: 'body.location.city', message: 'Для очного мероприятия укажите город' });
    }
    return details;
};

const assertDates = (e) => {
    const details = [];
    if (e.startsAt && e.endsAt && e.endsAt <= e.startsAt) {
        details.push({ field: 'body.endsAt', message: 'Окончание должно быть позже начала' });
    }
    if (e.registrationDeadline && e.startsAt && e.registrationDeadline > e.startsAt) {
        details.push({ field: 'body.registrationDeadline', message: 'Срок регистрации не может быть позже начала' });
    }
    if (details.length) throw validationError(details);
};

const assertPublishable = (e) => {
    const details = publicationErrors(e);
    if (details.length) throw validationError(details);
};

// Полная проверка при публикации (в том числе повторной – после снятия с публикации):
// требования публикации, порядок дат, начало в будущем, срок регистрации еще не истек
const assertCanPublishNow = (e) => {
    const details = publicationErrors(e);
    const now = new Date();
    if (e.startsAt && e.startsAt <= now) details.push({ field: 'body.startsAt', message: 'Начало должно быть в будущем' });
    if (e.registrationDeadline && e.registrationDeadline <= now) {
        details.push({ field: 'body.registrationDeadline', message: 'Срок регистрации уже истек' });
    }
    if (e.registrationDeadline && e.startsAt && e.registrationDeadline > e.startsAt) {
        details.push({ field: 'body.registrationDeadline', message: 'Срок регистрации не может быть позже начала' });
    }
    if (details.length) throw validationError(details);
};

// Что можно менять у опубликованного мероприятия после начала.
// Идет: начало, часовой пояс, формат, вместимость и параметры регистрации зафиксированы; окончание можно
// только продлить; место и ссылку можно исправить (участники получают уведомление).
// Завершено: можно исправить только описание (и передать мероприятие – это делает администратор)
const EDITABLE_AFTER_START = {
    live: ['title', 'description', 'coverUrl', 'tags', 'categoryId', 'organizerId', 'endsAt', 'locationCity', 'locationVenue', 'locationUrl'],
    finished: ['description', 'organizerId']
};

const ATTR_FIELDS = { categoryId: 'category', organizerId: 'organizer', locationCity: 'location.city',
    locationVenue: 'location.venue', locationOnline: 'location.online', locationUrl: 'location.url' };

const comparable = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

// Атрибуты запроса, значение которых действительно отличается от текущего
// (клиент может прислать форму целиком, вместе с неизменными полями)
const changedAttributes = (event, attrs) => Object.keys(attrs).filter((k) => comparable(event.get(k)) !== comparable(attrs[k]));

const assertEditableAfterStart = (event, attrs) => {
    const phase = event.phase;
    if (event.status !== 'published' || !phase || phase === 'upcoming') return;
    const changed = changedAttributes(event, attrs);
    const locked = changed.filter((k) => !EDITABLE_AFTER_START[phase].includes(k));
    if (locked.length) {
        const message = phase === 'live'
            ? 'Мероприятие уже идет: начало, часовой пояс, формат, вместимость и регистрацию изменить нельзя'
            : 'Мероприятие завершено: можно исправить только описание';
        throw new ApiError(409, message, {
            code: phase === 'live' ? 'EVENT_STARTED' : 'EVENT_FINISHED',
            details: locked.map((k) => ({ field: `body.${ATTR_FIELDS[k] || k}`, message: 'Поле нельзя изменить' }))
        });
    }
    if (phase === 'live' && changed.includes('endsAt') && !(attrs.endsAt && attrs.endsAt > event.endsAt)) {
        throw validationError([{ field: 'body.endsAt', message: 'Окончание идущего мероприятия можно только продлить' }]);
    }
};

// Результат действий владельца или администратора: ссылка подключения им доступна
const reload = async (id) => (await Event.findByPk(id, {
    include: [includeCategory, { association: 'organizer', attributes: ['id', 'name'] }]
})).revealLink();

// Создает организатор или администратор; владелец – создатель (администратор может сразу назначить другого).
// По умолчанию создается черновик; status = published – создать и сразу опубликовать
const create = async (data, user) => {
    await assertOrganizerChange(data, user);
    const attrs = { organizerId: user.id, ...toAttributes(data), status: data.status || 'draft' };
    const event = Event.build(attrs);
    assertDates(event);
    if (event.status === 'published') {
        assertCanPublishNow(event);
        event.publishedAt = new Date();
    }
    await event.save();
    return reload(event.id);
};

const sameTime = (a, b) => (a ? a.getTime() : null) === (b ? b.getTime() : null);

// Изменение мероприятия. Отмененное не изменяется. Для опубликованного:
// - перенос начала или окончания – новая версия расписания, пересчет напоминаний и уведомление участникам;
//   у завершенного мероприятия расписание не меняется;
// - смена места, формата или ссылки – уведомление участникам, напоминания не затрагиваются;
// - после изменения мероприятие по-прежнему должно удовлетворять требованиям публикации.
// Все изменения и уведомления – одна транзакция; отправка в Socket.IO – после фиксации
const update = async (id, data, user) => {
    const attrs = toAttributes(data);
    const { eventId, notificationIds, previousOwner } = await sequelize.transaction(async (transaction) => {
        // блокировка строки: регистрации и планировщик напоминаний ждут окончания изменения
        const event = await Event.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!event || (event.status === 'draft' && !canManageEvent(user, event))) throw ApiError.notFound('Мероприятие не найдено');
        assertCanManageEvent(user, event);
        await assertOrganizerChange(data, user, transaction);
        if (event.status === 'cancelled') throw ApiError.conflict('Отмененное мероприятие не изменяется', 'EVENT_CANCELLED');
        if (attrs.capacity && attrs.capacity < event.seatsTaken) {
            throw ApiError.conflict(`Вместимость не может быть меньше числа занятых мест (${event.seatsTaken})`, 'CAPACITY_TOO_SMALL');
        }

        assertEditableAfterStart(event, attrs);

        const before = { startsAt: event.startsAt, endsAt: event.endsAt, phase: event.phase };
        const beforeOwner = event.organizerId;
        const beforeLocation = Object.fromEntries(LOCATION_ATTRS.map((a) => [a, event.get(a)]));
        event.set(attrs);
        assertDates(event);

        const ids = [];
        if (event.status === 'published') {
            assertPublishable(event);
            const scheduleChanged = !sameTime(before.startsAt, event.startsAt) || !sameTime(before.endsAt, event.endsAt);
            if (scheduleChanged) {
                if (!sameTime(before.startsAt, event.startsAt) && event.startsAt <= new Date()) {
                    throw validationError([{ field: 'body.startsAt', message: 'Новое начало должно быть в будущем' }]);
                }
                event.scheduleVersion += 1;
            }
            await event.save({ transaction });
            if (scheduleChanged) {
                await reminderService.rescheduleForEvent(event, transaction);
                ids.push(...await notificationService.createForEventParticipants({
                    eventId: event.id,
                    type: 'event_rescheduled',
                    payload: {
                        // extended – идущее мероприятие продлено (начало не менялось)
                        kind: before.phase === 'live' ? 'extended' : 'rescheduled',
                        startsAt: event.startsAt, endsAt: event.endsAt, timezone: event.timezone,
                        previousStartsAt: before.startsAt, previousEndsAt: before.endsAt, scheduleVersion: event.scheduleVersion
                    },
                    dedupKey: `event:${event.id}:rescheduled:v${event.scheduleVersion}`
                }, transaction));
            }
            const locationChanged = LOCATION_ATTRS.filter((a) => event.get(a) !== beforeLocation[a]);
            if (locationChanged.length) {
                // ссылка подключения в уведомление не попадает – только признак, что она изменилась
                ids.push(...await notificationService.createForEventParticipants({
                    eventId: event.id,
                    type: 'event_location_changed',
                    payload: {
                        city: event.locationCity, venue: event.locationVenue, online: event.locationOnline,
                        urlChanged: locationChanged.includes('locationUrl')
                    },
                    dedupKey: `event:${event.id}:location:${event.updatedAt.getTime()}`
                }, transaction));
            }
        } else {
            await event.save({ transaction });
        }
        return { eventId: event.id, notificationIds: ids, previousOwner: beforeOwner !== event.organizerId ? beforeOwner : null };
    });
    await notificationService.deliver(notificationIds);
    // прежний владелец (после передачи мероприятия) теряет доступ к чату, если он не участник
    if (previousOwner) notify.revokeChat(previousOwner, eventId, 'ownership_transferred');
    return reload(eventId);
};

// Действия с состоянием публикации. Строка мероприятия блокируется на время действия
const withLockedEvent = (id, user, fn) => sequelize.transaction(async (transaction) => {
    const event = await Event.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!event || (event.status === 'draft' && !canManageEvent(user, event))) throw ApiError.notFound('Мероприятие не найдено');
    assertCanManageEvent(user, event);
    return fn(event, transaction);
});

// Публикация черновика (в том числе повторная) – полная проверка: начало и окончание (начало – в будущем),
// данные формата, срок регистрации не истек и не позже начала
const publish = async (id, user) => {
    const eventId = await withLockedEvent(id, user, async (event, transaction) => {
        if (event.status !== 'draft') throw ApiError.conflict('Опубликовать можно только черновик', 'EVENT_NOT_DRAFT');
        assertCanPublishNow(event);
        await event.update({ status: 'published', publishedAt: new Date() }, { transaction });
        return event.id;
    });
    return reload(eventId);
};

// Снятие с публикации (в черновик) – исправление ошибочной публикации: только до начала и только если
// на мероприятие никогда не регистрировались (отмененные регистрации тоже считаются). В остальных случаях
// мероприятие отменяют. Повторная публикация проходит ту же проверку, что и первая
const unpublish = async (id, user) => {
    const eventId = await withLockedEvent(id, user, async (event, transaction) => {
        if (event.status !== 'published') throw ApiError.conflict('Снять с публикации можно только опубликованное мероприятие', 'EVENT_NOT_PUBLISHED');
        if (event.phase !== 'upcoming') {
            throw ApiError.conflict('Мероприятие уже началось: снять его с публикации нельзя', 'EVENT_STARTED');
        }
        if (await Registration.count({ where: { eventId: event.id }, transaction })) {
            throw ApiError.conflict('На мероприятие уже регистрировались: его можно только отменить', 'EVENT_HAS_REGISTRATIONS');
        }
        await event.update({ status: 'draft', publishedAt: null }, { transaction });
        return event.id;
    });
    return reload(eventId);
};

// Отмена опубликованного мероприятия: история регистраций сохраняется (регистрации и отметки
// о посещении остаются как были), регистрация закрывается (бронь требует status = published),
// ожидающие напоминания отменяются, активные участники получают уведомление – в одной транзакции.
// Идущее мероприятие отменяется только с причиной
const cancel = async (id, user, { reason } = {}) => {
    const { eventId, ids } = await withLockedEvent(id, user, async (event, transaction) => {
        if (event.status === 'cancelled') throw ApiError.conflict('Мероприятие уже отменено', 'EVENT_CANCELLED');
        if (event.status !== 'published') throw ApiError.conflict('Черновик не отменяют – его можно удалить', 'EVENT_NOT_PUBLISHED');
        if (event.phase === 'finished') throw ApiError.conflict('Завершенное мероприятие нельзя отменить', 'EVENT_FINISHED');
        if (event.phase === 'live' && !reason) {
            throw validationError([{ field: 'body.reason', message: 'Мероприятие уже идет: укажите причину отмены' }]);
        }
        await event.update({ status: 'cancelled', cancelledAt: new Date(), cancelReason: reason || null }, { transaction });
        await reminderService.cancelForEvent(event.id, transaction);
        const created = await notificationService.createForEventParticipants({
            eventId: event.id,
            type: 'event_cancelled',
            payload: { reason: reason || null },
            dedupKey: `event:${event.id}:cancelled`
        }, transaction);
        return { eventId: event.id, ids: created };
    });
    await notificationService.deliver(ids);
    // чат отмененного мероприятия становится доступен только для чтения
    notify.toRooms([notify.rooms.event(String(eventId))], 'chat:readonly', { eventId: String(eventId) });
    return reload(eventId);
};

// Удаление – только черновика без регистраций: история участия не уничтожается,
// опубликованное мероприятие снимают с публикации или отменяют.
// Сообщения чата и избранное черновика удаляет БД (ON DELETE CASCADE)
const remove = async (id, user) => withLockedEvent(id, user, async (event, transaction) => {
    if (event.status !== 'draft') {
        throw ApiError.conflict('Удалить можно только черновик: опубликованное мероприятие снимите с публикации или отмените', 'EVENT_NOT_DRAFT');
    }
    if (await Registration.count({ where: { eventId: event.id }, transaction })) {
        throw ApiError.conflict('Нельзя удалить мероприятие, на которое уже регистрировались: его можно отменить', 'EVENT_HAS_REGISTRATIONS');
    }
    await event.destroy({ transaction });
    return event;
});

// Мероприятия организатора (для администратора – все) с числом активных и отмененных регистраций
const listManaged = async (user, query) => {
    const where = isAdmin(user) && query.all ? {} : { organizerId: user.id };
    if (query.status) where.status = query.status;
    if (query.search) where.title = { [Op.iLike]: likePattern(query.search) };
    const page = paginate(query);
    const { rows, count } = await Event.findAndCountAll({
        where,
        include: [includeCategory, { association: 'organizer', attributes: ['id', 'name'] }],
        // черновики без даты – первыми
        order: [[sequelize.literal('starts_at IS NULL'), 'DESC'], ['startsAt', 'DESC'], ['id', 'DESC']],
        offset: page.skip,
        limit: page.limit
    });
    const ids = rows.map((e) => e.id);
    const counts = ids.length ? await sequelize.query(
        `SELECT event_id, count(*) FILTER (WHERE status <> 'cancelled')::int AS active,
                count(*) FILTER (WHERE attended)::int AS attended,
                count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
         FROM registrations WHERE event_id IN (:ids) GROUP BY event_id`,
        { replacements: { ids }, type: QueryTypes.SELECT }
    ) : [];
    const byId = new Map(counts.map((c) => [String(c.event_id), c]));
    const items = rows.map((e) => {
        const c = byId.get(String(e.id)) || { active: 0, attended: 0, cancelled: 0 };
        return { ...e.revealLink().toJSON(), registrations: { active: c.active, attended: c.attended, cancelled: c.cancelled } };
    });
    return pageResult(items, count, page);
};

// Статистика одного мероприятия для его организатора и администратора
const stats = async (id, user) => {
    const event = await Event.findByPk(id);
    if (!event || (event.status === 'draft' && !canManageEvent(user, event))) throw ApiError.notFound('Мероприятие не найдено');
    assertCanManageEvent(user, event);
    const [[totals], timeline] = await Promise.all([
        sequelize.query(
            `SELECT count(*) FILTER (WHERE status <> 'cancelled')::int AS active,
                    count(*) FILTER (WHERE attended)::int AS attended,
                    count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
                    count(DISTINCT user_id)::int AS users
             FROM registrations WHERE event_id = :id`,
            { replacements: { id }, type: QueryTypes.SELECT }
        ),
        sequelize.query(
            `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, count(*)::int AS count
             FROM registrations WHERE event_id = :id GROUP BY 1 ORDER BY 1`,
            { replacements: { id }, type: QueryTypes.SELECT }
        )
    ]);
    return {
        event: { id: String(event.id), title: event.title, capacity: event.capacity, seatsTaken: event.seatsTaken },
        registrations: totals,
        fillRate: event.capacity ? Math.round((event.seatsTaken / event.capacity) * 100) : null,
        favorites: await Favorite.count({ where: { eventId: id } }),
        timeline
    };
};

// Похожие мероприятия: та же категория или общие теги, только будущие
const similar = async (id, limit = 3) => {
    const event = await Event.findByPk(id);
    if (!event || event.status === 'draft') throw ApiError.notFound('Мероприятие не найдено');
    const or = [{ tags: { [Op.overlap]: event.tags } }];
    if (event.categoryId) or.push({ categoryId: event.categoryId });
    return Event.findAll({
        where: { id: { [Op.ne]: event.id }, startsAt: { [Op.gte]: new Date() }, status: 'published', [Op.or]: or },
        include: [includeCategory],
        order: [['startsAt', 'ASC'], ['id', 'ASC']],
        limit
    });
};

// Список городов для фильтра каталога
const cities = async () => {
    const rows = await sequelize.query(
        `SELECT DISTINCT location_city AS city FROM events
         WHERE status = 'published' AND location_city IS NOT NULL AND location_city <> '' ORDER BY 1`,
        { type: QueryTypes.SELECT }
    );
    return rows.map((r) => r.city);
};

module.exports = {
    list, getById, findOrFail, create, update, publish, unpublish, cancel, remove, listManaged, stats, similar, cities, buildFilter,
    publicationErrors
};

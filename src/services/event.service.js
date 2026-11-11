const { Op, QueryTypes } = require('sequelize');
const { sequelize, Event, Registration, Reminder, Favorite } = require('../models');
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
const buildFilter = ({ search, type, category, city, tag, online, from, to, when }) => {
    const and = [];
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

const findOrFail = async (id) => {
    const event = await Event.findByPk(id, {
        include: [includeCategory, { association: 'organizer', attributes: ['id', 'name'] }]
    });
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    return event;
};

// Карточка мероприятия; для вошедшего пользователя добавляется его регистрация,
// напоминания и признак «в избранном»
const getById = async (id, user) => {
    const event = await findOrFail(id);
    const result = event.toJSON();
    if (user) {
        const [registration, reminders, favorite] = await Promise.all([
            Registration.findOne({ where: { eventId: id, userId: user.id, status: { [Op.ne]: 'cancelled' } } }),
            Reminder.findAll({ where: { eventId: id, userId: user.id }, order: [['offsetMinutes', 'DESC']] }),
            Favorite.count({ where: { eventId: id, userId: user.id } })
        ]);
        result.myRegistration = registration ? registration.toJSON() : null;
        result.myReminders = reminders.map((r) => r.toJSON());
        result.isFavorite = favorite > 0;
    }
    return result;
};

// Поля запроса → атрибуты модели (location раскладывается по столбцам, category → categoryId)
const toAttributes = (data) => {
    const attrs = {};
    for (const [key, value] of Object.entries(data)) {
        if (key === 'location') Object.assign(attrs, Event.locationToColumns(value));
        else if (key === 'category') attrs.categoryId = value;
        // null в запросе – очистить необязательное поле; у полей со значением по умолчанию – вернуть его
        else if (value === null && key === 'description') attrs.description = '';
        else if (value === null && key === 'coverUrl') attrs.coverUrl = '';
        else if (value === null && key === 'tags') attrs.tags = [];
        else attrs[key] = value;
    }
    return attrs;
};

const create = async (data, user) => {
    const event = await Event.create({ ...toAttributes(data), organizerId: user.id });
    return Event.findByPk(event.id, { include: [includeCategory] });
};

const update = async (id, data) => {
    const attrs = toAttributes(data);
    const updated = await sequelize.transaction(async (transaction) => {
        // блокировка строки: регистрации этого мероприятия ждут, пока проверка вместимости не завершится
        const event = await Event.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!event) throw ApiError.notFound('Мероприятие не найдено');
        if (attrs.capacity && attrs.capacity < event.seatsTaken) {
            throw ApiError.conflict(`Вместимость не может быть меньше числа занятых мест (${event.seatsTaken})`, 'CAPACITY_TOO_SMALL');
        }
        const startsAt = attrs.startsAt || event.startsAt;
        const endsAt = 'endsAt' in attrs ? attrs.endsAt : event.endsAt;
        if (endsAt && endsAt <= startsAt) {
            throw new ApiError(422, 'Ошибка валидации данных', {
                details: [{ field: 'body.endsAt', message: 'Окончание должно быть позже начала' }]
            });
        }
        const dateChanged = attrs.startsAt && attrs.startsAt.getTime() !== event.startsAt.getTime();
        await event.update(attrs, { transaction });
        if (dateChanged) await reminderService.rescheduleForEvent(event, transaction);
        return event;
    });
    return Event.findByPk(updated.id, { include: [includeCategory] });
};

// Удаление: регистрации, напоминания, сообщения чата и избранное удаляет БД (ON DELETE CASCADE)
const remove = async (id) => {
    const event = await Event.findByPk(id);
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    await event.destroy();
    return event;
};

// Похожие мероприятия: та же категория или общие теги, только будущие
const similar = async (id, limit = 3) => {
    const event = await Event.findByPk(id);
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
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
         WHERE location_city IS NOT NULL AND location_city <> '' ORDER BY 1`,
        { type: QueryTypes.SELECT }
    );
    return rows.map((r) => r.city);
};

module.exports = { list, getById, findOrFail, create, update, remove, similar, cities, buildFilter };

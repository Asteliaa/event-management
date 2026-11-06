const { Event, Registration, Reminder, Message, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { paginate, pageResult, escapeRegex } = require('../utils/pagination');
const reminderService = require('./reminder.service');

const SORTS = {
    date: { startsAt: 1 },
    '-date': { startsAt: -1 },
    popular: { seatsTaken: -1, startsAt: 1 },
    new: { createdAt: -1 }
};

const populateCategory = { path: 'category', select: 'name slug color' };

// Фильтр MongoDB из параметров запроса каталога
const buildFilter = ({ search, type, category, city, tag, online, from, to, when }) => {
    const filter = {};
    if (search) {
        const rx = { $regex: escapeRegex(search), $options: 'i' };
        filter.$or = [{ title: rx }, { description: rx }, { tags: search.toLowerCase() }];
    }
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (city) filter['location.city'] = { $regex: `^${escapeRegex(city)}$`, $options: 'i' };
    if (tag) filter.tags = tag;
    if (online !== undefined) filter['location.online'] = online ? true : { $ne: true };

    const now = new Date();
    const date = {};
    if (when === 'upcoming') date.$gte = now;
    if (when === 'past') date.$lt = now;
    if (from) date.$gte = date.$gte && date.$gte > from ? date.$gte : from;
    if (to) date.$lte = to;
    if (Object.keys(date).length) filter.startsAt = date;
    return filter;
};

const list = async (query) => {
    const filter = buildFilter(query);
    const page = paginate(query);
    const [items, total] = await Promise.all([
        Event.find(filter).sort(SORTS[query.sort]).skip(page.skip).limit(page.limit).populate(populateCategory),
        Event.countDocuments(filter)
    ]);
    return pageResult(items, total, page);
};

const findOrFail = async (id) => {
    const event = await Event.findById(id).populate(populateCategory).populate('organizer', 'name');
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    return event;
};

// Карточка мероприятия; для вошедшего пользователя добавляется его регистрация,
// напоминания и признак «в избранном»
const getById = async (id, user) => {
    const event = await findOrFail(id);
    const result = event.toJSON();
    if (user) {
        const [registration, reminders, me] = await Promise.all([
            Registration.findOne({ event: id, user: user.id, status: { $ne: 'cancelled' } }),
            Reminder.find({ event: id, user: user.id }).sort({ offsetMinutes: -1 }),
            User.findById(user.id).select('favorites').lean()
        ]);
        result.myRegistration = registration ? registration.toJSON() : null;
        result.myReminders = reminders.map((r) => r.toJSON());
        result.isFavorite = Boolean(me?.favorites?.some((f) => f.toString() === id));
    }
    return result;
};

const create = async (data, user) => {
    const event = await Event.create({ ...data, organizer: user.id });
    return event.populate(populateCategory);
};

const update = async (id, data) => {
    const event = await Event.findById(id);
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    if (data.capacity && data.capacity < event.seatsTaken) {
        throw ApiError.conflict(`Вместимость не может быть меньше числа занятых мест (${event.seatsTaken})`, 'CAPACITY_TOO_SMALL');
    }
    const dateChanged = data.startsAt && data.startsAt.getTime() !== event.startsAt.getTime();
    // null в запросе – очистить необязательное поле
    for (const [key, value] of Object.entries(data)) {
        event.set(key, value === null ? undefined : value);
    }
    await event.save();
    if (dateChanged) await reminderService.rescheduleForEvent(event);
    return event.populate(populateCategory);
};

// Каскадное удаление: регистрации, напоминания, сообщения чата и ссылки в избранном
const remove = async (id) => {
    const event = await Event.findByIdAndDelete(id);
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    await Promise.all([
        Registration.deleteMany({ event: id }),
        Reminder.deleteMany({ event: id }),
        Message.deleteMany({ event: id }),
        User.updateMany({ favorites: id }, { $pull: { favorites: id } })
    ]);
    return event;
};

// Похожие мероприятия: та же категория или общие теги, только будущие
const similar = async (id, limit = 3) => {
    const event = await Event.findById(id);
    if (!event) throw ApiError.notFound('Мероприятие не найдено');
    const or = [{ tags: { $in: event.tags } }];
    if (event.category) or.push({ category: event.category });
    return Event.find({ _id: { $ne: event._id }, startsAt: { $gte: new Date() }, status: 'published', $or: or })
        .sort({ startsAt: 1 }).limit(limit).populate(populateCategory);
};

// Список городов для фильтра каталога
const cities = () => Event.distinct('location.city', { 'location.city': { $nin: [null, ''] } });

module.exports = { list, getById, findOrFail, create, update, remove, similar, cities, buildFilter };

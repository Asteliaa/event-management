const { User, Event, Registration, Reminder } = require('../models');
const ApiError = require('../utils/ApiError');
const { paginate, pageResult, escapeRegex } = require('../utils/pagination');

const list = async (query) => {
    const filter = {};
    if (query.role) filter.role = query.role;
    if (query.search) {
        const rx = { $regex: escapeRegex(query.search), $options: 'i' };
        filter.$or = [{ name: rx }, { email: rx }];
    }
    const page = paginate(query);
    const [users, total] = await Promise.all([
        User.find(filter).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
        User.countDocuments(filter)
    ]);
    return pageResult(users, total, page);
};

const update = async (id, data, currentUser) => {
    if (id === currentUser.id) throw ApiError.badRequest('Нельзя изменить роль или заблокировать самого себя');
    const user = await User.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
    if (!user) throw ApiError.notFound('Пользователь не найден');
    return user;
};

// Удаление пользователя: активные регистрации освобождают места, напоминания удаляются
const remove = async (id, currentUser) => {
    if (id === currentUser.id) throw ApiError.badRequest('Нельзя удалить самого себя');
    const user = await User.findByIdAndDelete(id);
    if (!user) throw ApiError.notFound('Пользователь не найден');
    const active = await Registration.find({ user: id, status: { $ne: 'cancelled' } });
    await Promise.all(active.map((r) => Event.updateOne({ _id: r.event }, { $inc: { seatsTaken: -r.tickets } })));
    await Promise.all([Registration.deleteMany({ user: id }), Reminder.deleteMany({ user: id })]);
    return user;
};

// Избранное: $addToSet не добавит дубликат, $pull удалит ссылку
const listFavorites = async (userId) => {
    const user = await User.findById(userId).populate({
        path: 'favorites',
        options: { sort: { startsAt: 1 } },
        populate: { path: 'category', select: 'name slug color' }
    });
    return user ? user.favorites : [];
};

const addFavorite = async (userId, eventId) => {
    if (!await Event.exists({ _id: eventId })) throw ApiError.notFound('Мероприятие не найдено');
    await User.updateOne({ _id: userId }, { $addToSet: { favorites: eventId } });
};

const removeFavorite = (userId, eventId) => User.updateOne({ _id: userId }, { $pull: { favorites: eventId } });

module.exports = { list, update, remove, listFavorites, addFavorite, removeFavorite };

const { Op } = require('sequelize');
const { sequelize, User, Event, Favorite } = require('../models');
const ApiError = require('../utils/ApiError');
const { paginate, pageResult, likePattern } = require('../utils/pagination');

// Список для администратора; удаленные (обезличенные) – только с фильтром status=deleted
const list = async (query) => {
    const where = { status: query.status || { [Op.ne]: 'deleted' } };
    if (query.role) where.role = query.role;
    if (query.search) {
        const pattern = likePattern(query.search);
        where[Op.or] = [{ name: { [Op.iLike]: pattern } }, { email: { [Op.iLike]: pattern } }];
    }
    const page = paginate(query);
    const { rows, count } = await User.findAndCountAll({
        where,
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        offset: page.skip,
        limit: page.limit
    });
    return pageResult(rows, count, page);
};

// Избранное: таблица favorites (первичный ключ user_id + event_id не допускает дубликатов)
const listFavorites = async (userId) => Event.findAll({
    include: [
        { association: 'category', attributes: ['id', 'name', 'slug', 'color'] },
        { association: 'favoritedBy', attributes: [], where: { id: userId }, through: { attributes: [] }, required: true }
    ],
    order: [['startsAt', 'ASC'], ['id', 'ASC']]
});

const addFavorite = async (userId, eventId) => {
    if (!await Event.count({ where: { id: eventId, status: { [Op.ne]: 'draft' } } })) throw ApiError.notFound('Мероприятие не найдено');
    await sequelize.query(
        'INSERT INTO favorites (user_id, event_id) VALUES (:userId, :eventId) ON CONFLICT DO NOTHING',
        { replacements: { userId, eventId } }
    );
};

const removeFavorite = (userId, eventId) => Favorite.destroy({ where: { userId, eventId } });

module.exports = { list, listFavorites, addFavorite, removeFavorite };

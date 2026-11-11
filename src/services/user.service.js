const { Op } = require('sequelize');
const { sequelize, User, Event, Favorite } = require('../models');
const ApiError = require('../utils/ApiError');
const { paginate, pageResult, likePattern } = require('../utils/pagination');

const list = async (query) => {
    const where = {};
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

const update = async (id, data, currentUser) => {
    if (String(id) === String(currentUser.id)) throw ApiError.badRequest('Нельзя изменить роль или заблокировать самого себя');
    const user = await User.findByPk(id);
    if (!user) throw ApiError.notFound('Пользователь не найден');
    await user.update(data);
    return user;
};

// Удаление пользователя в одной транзакции: активные регистрации освобождают места,
// затем строка пользователя удаляется, а регистрации, напоминания и избранное удаляет БД (ON DELETE CASCADE)
const remove = async (id, currentUser) => {
    if (String(id) === String(currentUser.id)) throw ApiError.badRequest('Нельзя удалить самого себя');
    return sequelize.transaction(async (transaction) => {
        const user = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) throw ApiError.notFound('Пользователь не найден');
        await sequelize.query(
            `WITH active AS (
                 SELECT event_id, sum(tickets) AS tickets FROM registrations
                 WHERE user_id = :id AND status <> 'cancelled'
                 GROUP BY event_id
             )
             UPDATE events e SET seats_taken = e.seats_taken - active.tickets, updated_at = now()
             FROM active WHERE e.id = active.event_id`,
            { replacements: { id }, transaction }
        );
        await user.destroy({ transaction });
        return user;
    });
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
    if (!await Event.count({ where: { id: eventId } })) throw ApiError.notFound('Мероприятие не найдено');
    await sequelize.query(
        'INSERT INTO favorites (user_id, event_id) VALUES (:userId, :eventId) ON CONFLICT DO NOTHING',
        { replacements: { userId, eventId } }
    );
};

const removeFavorite = (userId, eventId) => Favorite.destroy({ where: { userId, eventId } });

module.exports = { list, update, remove, listFavorites, addFavorite, removeFavorite };

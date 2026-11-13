const { Op, QueryTypes } = require('sequelize');
const { sequelize, Notification } = require('../models');
const ApiError = require('../utils/ApiError');
const notify = require('../socket/notify');
const { paginate, pageResult } = require('../utils/pagination');

// История уведомлений. Уведомление записывается в БД в той же транзакции, что и его причина;
// в Socket.IO оно отправляется только после фиксации транзакции (deliver), поэтому клиент
// не получит уведомление об изменении, которое затем откатилось. Если пользователь не в сети,
// уведомление дождется его в истории.

const includeEvent = { association: 'event', attributes: ['id', 'title', 'startsAt', 'endsAt', 'timezone', 'status', 'type'] };

// Уведомления всем активным участникам мероприятия (INSERT ... SELECT одним запросом).
// dedupKey – шаблон ключа: одинаковый ключ у одного пользователя не создаст второе уведомление
const createForEventParticipants = async ({ eventId, type, payload, dedupKey }, transaction) => {
    const rows = await sequelize.query(
        `INSERT INTO notifications (user_id, type, event_id, registration_id, payload, dedup_key)
         SELECT reg.user_id, :type, :eventId, reg.id, CAST(:payload AS jsonb), :dedupKey
         FROM registrations reg
         WHERE reg.event_id = :eventId AND reg.status <> 'cancelled'
         ON CONFLICT (user_id, dedup_key) DO NOTHING
         RETURNING id`,
        { replacements: { eventId, type, payload: JSON.stringify(payload || {}), dedupKey }, type: QueryTypes.SELECT, transaction }
    );
    return rows.map((r) => r.id);
};

const createForUser = async ({ userId, type, eventId, registrationId, reminderId, payload, dedupKey }, transaction) => {
    const rows = await sequelize.query(
        `INSERT INTO notifications (user_id, type, event_id, registration_id, reminder_id, payload, dedup_key)
         VALUES (:userId, :type, :eventId, :registrationId, :reminderId, CAST(:payload AS jsonb), :dedupKey)
         ON CONFLICT (user_id, dedup_key) DO NOTHING
         RETURNING id`,
        {
            replacements: {
                userId, type, eventId: eventId ?? null, registrationId: registrationId ?? null,
                reminderId: reminderId ?? null, payload: JSON.stringify(payload || {}), dedupKey
            },
            type: QueryTypes.SELECT,
            transaction
        }
    );
    return rows.map((r) => r.id);
};

// Отправка в личные комнаты пользователей после фиксации транзакции
const deliver = async (ids) => {
    if (!ids.length) return [];
    const list = await Notification.findAll({ where: { id: ids }, include: [includeEvent], order: [['id', 'ASC']] });
    for (const n of list) notify.toRooms([notify.rooms.user(String(n.userId))], 'notification:new', n.toJSON());
    return list;
};

const list = async (userId, { unread, page, limit } = {}) => {
    const where = { userId };
    if (unread !== undefined) where.readAt = unread ? null : { [Op.ne]: null };
    const p = paginate({ page, limit });
    const [{ rows, count }, unreadCount] = await Promise.all([
        Notification.findAndCountAll({
            where, include: [includeEvent], order: [['createdAt', 'DESC'], ['id', 'DESC']], offset: p.skip, limit: p.limit
        }),
        Notification.count({ where: { userId, readAt: null } })
    ]);
    const result = pageResult(rows, count, p);
    result.meta.unread = unreadCount;
    return result;
};

const unreadCount = (userId) => Notification.count({ where: { userId, readAt: null } });

const setRead = async (userId, id, read) => {
    const n = await Notification.findByPk(id, { include: [includeEvent] });
    if (!n || String(n.userId) !== String(userId)) throw ApiError.notFound('Уведомление не найдено');
    await n.update({ readAt: read ? (n.readAt || new Date()) : null });
    return n;
};

const markAllRead = async (userId) => {
    const [count] = await Notification.update({ readAt: new Date() }, { where: { userId, readAt: null } });
    return count;
};

module.exports = { createForEventParticipants, createForUser, deliver, list, unreadCount, setRead, markAllRead };

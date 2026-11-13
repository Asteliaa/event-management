const { Op } = require('sequelize');
const { Event, Registration } = require('../models');
const { canManageEvent } = require('./access');

// Доступ к чату мероприятия. Проверяется при входе в комнату и заново при каждом сообщении,
// поэтому отмена участия, потеря роли или отмена мероприятия действуют и для уже открытых соединений.
// - Организатор-владелец и администратор: чтение; запись – пока мероприятие не отменено.
// - Активный участник (регистрация не отменена): чтение и запись опубликованного мероприятия;
//   после отмены мероприятия – только чтение истории.
// - Отменивший участие, посторонние, гости: доступа нет. Черновик – только владелец и администратор.
const chatAccess = async (user, eventId) => {
    const event = await Event.findByPk(eventId, { attributes: ['id', 'title', 'status', 'organizerId'] });
    if (!event) return { allowed: false, error: 'Мероприятие не найдено' };
    if (canManageEvent(user, event)) {
        return { allowed: true, canWrite: event.status !== 'cancelled', event };
    }
    if (event.status === 'draft') return { allowed: false, error: 'Мероприятие не найдено' };
    const active = await Registration.count({
        where: { eventId, userId: user.id, status: { [Op.ne]: 'cancelled' } }
    });
    if (!active) return { allowed: false, error: 'Чат доступен участникам мероприятия' };
    return { allowed: true, canWrite: event.status === 'published', event };
};

module.exports = { chatAccess };

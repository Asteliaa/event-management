// Правила доступа к мероприятиям, общие для REST API и Socket.IO.
// Права всегда проверяются на сервере по данным из БД; клиент только скрывает недоступные действия
const ApiError = require('../utils/ApiError');

const isAdmin = (user) => user?.role === 'admin';

// Владелец мероприятия – организатор, создавший его (или которому администратор передал мероприятие)
const isOwner = (user, event) => Boolean(user && event?.organizerId !== null && event?.organizerId !== undefined
    && String(event.organizerId) === String(user.id));

// Управлять мероприятием (изменять, публиковать, отменять, видеть участников и их email) могут
// администратор и организатор-владелец. Пользователь, у которого роль organizer отозвали,
// теряет права и на свои прежние мероприятия
const canManageEvent = (user, event) => isAdmin(user) || (user?.role === 'organizer' && isOwner(user, event));

const assertCanManageEvent = (user, event) => {
    if (!canManageEvent(user, event)) throw ApiError.forbidden('Управлять мероприятием может только его организатор или администратор');
};

// Создавать мероприятия могут организаторы и администраторы
const canCreateEvents = (user) => ['organizer', 'admin'].includes(user?.role);

module.exports = { isAdmin, isOwner, canManageEvent, assertCanManageEvent, canCreateEvents };

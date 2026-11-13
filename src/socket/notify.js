// Доступ к экземпляру Socket.IO из REST-контроллеров (уведомления об изменениях).
// Пока сервер Socket.IO не создан (например, в тестах REST API), уведомления не отправляются.
let io = null;

const rooms = {
    event: (id) => `event:${id}`,   // участники чата мероприятия
    user: (id) => `user:${id}`,     // все вкладки одного пользователя
    admins: 'admins'                // администраторы
};

const setIO = (server) => {
    io = server;
};

// Всем подключенным клиентам
const toAll = (name, payload) => {
    if (io) io.emit(name, payload);
};

// Только клиентам в указанных комнатах (каждый получит событие один раз)
const toRooms = (roomList, name, payload) => {
    if (io) io.to(roomList).emit(name, payload);
};

// Комнаты тех, кто управляет мероприятием: администраторы и личная комната организатора-владельца
const eventStaffRooms = (event) => {
    const list = [rooms.admins];
    const organizerId = event.organizerId ?? event.get?.('organizerId');
    if (organizerId !== null && organizerId !== undefined) list.push(rooms.user(String(organizerId)));
    return list;
};

// Завершить все соединения пользователя (блокировка, деактивация, удаление, смена пароля или роли):
// при переподключении сокет снова проходит проверку токена
const disconnectUser = (userId) => {
    if (io) io.in(rooms.user(String(userId))).disconnectSockets(true);
};

// Убрать пользователя из комнаты чата мероприятия (отмена участия, потеря прав)
const revokeChat = (userId, eventId, reason) => {
    if (!io) return;
    const personal = rooms.user(String(userId));
    io.to(personal).emit('chat:revoked', { eventId: String(eventId), reason });
    io.in(personal).socketsLeave(rooms.event(String(eventId)));
};

module.exports = { rooms, setIO, toAll, toRooms, eventStaffRooms, disconnectUser, revokeChat };

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

module.exports = { rooms, setIO, toAll, toRooms, eventStaffRooms };

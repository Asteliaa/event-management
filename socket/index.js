const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { Event, Message } = require('../models');
const socketAuth = require('./auth');
const notify = require('./notify');

const { rooms } = notify;

// Не больше 5 сообщений чата за 5 секунд с одного соединения
const RATE_LIMIT = { count: 5, windowMs: 5000 };

const log = process.env.NODE_ENV === 'test' ? () => {} : console.log;

// Подтверждение (acknowledgement): клиент может не передать функцию обратного вызова
const reply = (ack, data) => {
    if (typeof ack === 'function') ack(data);
};

// Пользователи без повторов (у одного пользователя может быть открыто несколько вкладок)
function uniqueUsers(sockets, exceptSocketId) {
    const users = new Map();
    for (const s of sockets) {
        if (s.id !== exceptSocketId) users.set(s.data.user.id, s.data.user);
    }
    return [...users.values()];
}

async function roomMembers(io, room, exceptSocketId) {
    return uniqueUsers(await io.in(room).fetchSockets(), exceptSocketId);
}

// Список пользователей онлайн рассылается всем клиентам
async function broadcastOnline(io) {
    io.emit('users:online', uniqueUsers(await io.fetchSockets()));
}

function isRateLimited(socket) {
    const now = Date.now();
    const recent = (socket.data.sent || []).filter((t) => now - t < RATE_LIMIT.windowMs);
    const limited = recent.length >= RATE_LIMIT.count;
    if (!limited) recent.push(now);
    socket.data.sent = recent;
    return limited;
}

// Выход из комнаты мероприятия с уведомлением остальных участников
async function leaveEventRoom(io, socket, eventId) {
    const room = rooms.event(eventId);
    if (!socket.rooms.has(room)) return;
    socket.leave(room);
    io.to(room).emit('room:left', {
        eventId,
        user: socket.data.user,
        members: await roomMembers(io, room)
    });
}

function onConnection(io, socket) {
    const { user } = socket.data;
    const personal = rooms.user(user.id);
    log(`Socket подключен: ${socket.id} (${user.email})`);

    // Уведомление о подключении получают все, кроме самого пользователя,
    // и только если это его первая вкладка
    const firstTab = !io.sockets.adapter.rooms.has(personal);
    socket.join(personal);
    if (user.role === 'admin') socket.join(rooms.admins);
    if (firstTab) socket.broadcast.emit('user:connected', user);
    broadcastOnline(io);

    // Вход в комнату мероприятия: ответ содержит историю чата из MongoDB и список участников
    socket.on('event:join', async ({ eventId } = {}, ack) => {
        try {
            if (!mongoose.isValidObjectId(eventId)) {
                return reply(ack, { ok: false, error: 'Некорректный id мероприятия' });
            }
            const event = await Event.findById(eventId).select('title');
            if (!event) {
                return reply(ack, { ok: false, error: 'Мероприятие не найдено' });
            }

            const room = rooms.event(eventId);
            const alreadyJoined = socket.rooms.has(room);
            socket.join(room);
            const [history, members] = await Promise.all([Message.history(eventId), roomMembers(io, room)]);
            // Остальным участникам комнаты (без отправителя); повторный вход не объявляется
            if (!alreadyJoined) socket.to(room).emit('room:joined', { eventId, user, members });
            reply(ack, {
                ok: true,
                event: { id: event.id, title: event.title },
                history: history.map((m) => m.toJSON()),
                members
            });
        } catch (error) {
            reply(ack, { ok: false, error: 'Ошибка сервера' });
        }
    });

    socket.on('event:leave', async ({ eventId } = {}, ack) => {
        await leaveEventRoom(io, socket, eventId);
        reply(ack, { ok: true });
    });

    // Сообщение в чат мероприятия: проверка, сохранение в MongoDB, рассылка в комнату
    socket.on('chat:message', async ({ eventId, text } = {}, ack) => {
        const room = rooms.event(eventId);
        const clean = typeof text === 'string' ? text.trim() : '';

        if (!socket.rooms.has(room)) {
            return reply(ack, { ok: false, error: 'Сначала откройте чат мероприятия' });
        }
        if (!clean) {
            return reply(ack, { ok: false, error: 'Пустое сообщение' });
        }
        if (clean.length > Message.MAX_LENGTH) {
            return reply(ack, { ok: false, error: `Сообщение длиннее ${Message.MAX_LENGTH} символов` });
        }
        if (isRateLimited(socket)) {
            return reply(ack, { ok: false, error: 'Слишком много сообщений, подождите несколько секунд' });
        }

        try {
            const message = (await Message.create({
                event: eventId, user: user.id, email: user.email, text: clean
            })).toJSON();
            // Отправитель получает сообщение в подтверждении, остальные – событием
            socket.to(room).emit('chat:message', message);
            reply(ack, { ok: true, message });
        } catch (error) {
            reply(ack, { ok: false, error: 'Не удалось сохранить сообщение' });
        }
    });

    // Индикатор «печатает»: передается только признак набора, без текста.
    // volatile – событие можно потерять, если клиент не готов его принять (не копится в буфере)
    socket.on('chat:typing', ({ eventId, isTyping } = {}) => {
        const room = rooms.event(eventId);
        if (!socket.rooms.has(room)) return;
        socket.to(room).volatile.emit('chat:typing', { eventId, user, isTyping: Boolean(isTyping) });
    });

    // Перед отключением сокет еще состоит в комнатах: сообщаем участникам чатов, что он вышел
    socket.on('disconnecting', async () => {
        // Копия списка: после первого await сокет уже выйдет из комнат
        const eventRooms = [...socket.rooms].filter((room) => room.startsWith('event:'));
        for (const room of eventRooms) {
            io.to(room).emit('room:left', {
                eventId: room.slice('event:'.length),
                user,
                members: await roomMembers(io, room, socket.id)
            });
        }
    });

    socket.on('disconnect', (reason) => {
        log(`Socket отключен: ${socket.id} (${user.email}), причина: ${reason}`);
        // Пользователь ушел, если у него не осталось открытых вкладок
        if (!io.sockets.adapter.rooms.has(personal)) {
            io.emit('user:disconnected', user);
        }
        broadcastOnline(io);
    });
}

// Создает сервер Socket.IO поверх HTTP-сервера Express
function createSocketServer(httpServer) {
    const io = new Server(httpServer, {
        cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
        maxHttpBufferSize: 1e5 // пакет больше 100 КБ разрывает соединение
    });

    io.use(socketAuth);
    io.on('connection', (socket) => onConnection(io, socket));
    notify.setIO(io);
    return io;
}

module.exports = createSocketServer;

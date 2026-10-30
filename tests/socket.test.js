const { tokenFor, useMemoryDB } = require('./helpers');
const http = require('http');
const request = require('supertest');
const mongoose = require('mongoose');
const { io: Client } = require('socket.io-client');
const { Event, Message } = require('../models');
const app = require('../server');
const createSocketServer = require('../socket');

useMemoryDB();

const anna = { id: new mongoose.Types.ObjectId().toString(), email: 'anna@b.c', role: 'user' };
const ivan = { id: new mongoose.Types.ObjectId().toString(), email: 'ivan@b.c', role: 'user' };
const admin = { id: new mongoose.Types.ObjectId().toString(), email: 'admin@b.c', role: 'admin' };

let io;
let url;
let clients = [];

beforeAll(async () => {
    const server = http.createServer(app);
    io = createSocketServer(server);
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
});

afterEach(() => {
    clients.forEach((c) => c.close());
    clients = [];
});

afterAll(() => io.close());

// Подключение клиента; reject при connect_error (отказ middleware авторизации)
const connect = (auth) => new Promise((resolve, reject) => {
    const socket = Client(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
    clients.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
});
const connectAs = (user) => connect({ token: tokenFor(user) });

const waitFor = (socket, name) => new Promise((resolve) => socket.once(name, resolve));
// Событие не должно прийти за ms миллисекунд
const notReceived = (socket, name, ms = 200) => new Promise((resolve, reject) => {
    const fail = () => reject(new Error(`Пришло лишнее событие ${name}`));
    socket.once(name, fail);
    setTimeout(() => {
        socket.off(name, fail);
        resolve();
    }, ms);
});

const newEvent = () => Event.create({ title: 'Вебинар', type: 'webinar', date: '2026-11-05', capacity: 5 });
const join = (socket, event) => socket.emitWithAck('event:join', { eventId: event.id });
const send = (socket, event, text) => socket.emitWithAck('chat:message', { eventId: event.id, text });

describe('Авторизация при подключении', () => {
    it('отклоняет подключение без токена', async () => {
        await expect(connect({})).rejects.toThrow('Требуется авторизация');
    });

    it('отклоняет недействительный и просроченный токен', async () => {
        await expect(connect({ token: 'abc' })).rejects.toThrow('Недействительный');
        await expect(connect({ token: tokenFor(anna, { expiresIn: -1 }) })).rejects.toThrow('Недействительный');
    });

    it('пропускает действительный JWT', async () => {
        const socket = await connectAs(anna);
        expect(socket.connected).toBe(true);
    });
});

describe('Подключение и отключение пользователей', () => {
    it('остальные получают user:connected и user:disconnected', async () => {
        const a = await connectAs(anna);
        const connected = waitFor(a, 'user:connected');
        const i = await connectAs(ivan);
        expect(await connected).toMatchObject({ email: 'ivan@b.c' });

        const disconnected = waitFor(a, 'user:disconnected');
        i.close();
        expect(await disconnected).toMatchObject({ email: 'ivan@b.c' });
    });

    it('вторая вкладка того же пользователя не дает повторного уведомления', async () => {
        const a = await connectAs(anna);
        const first = waitFor(a, 'user:connected');
        await connectAs(ivan);
        await first;
        const check = notReceived(a, 'user:connected');
        await connectAs(ivan);
        await check;
    });

    it('users:online содержит пользователей без повторов', async () => {
        const a = await connectAs(anna);
        await connectAs(ivan);
        const online = waitFor(a, 'users:online');
        await connectAs(ivan);
        expect((await online).map((u) => u.email).sort()).toEqual(['anna@b.c', 'ivan@b.c']);
    });
});

describe('Комнаты мероприятий', () => {
    it('ошибка при некорректном или несуществующем мероприятии', async () => {
        const a = await connectAs(anna);
        expect(await a.emitWithAck('event:join', { eventId: 'x' })).toMatchObject({ ok: false });
        expect(await a.emitWithAck('event:join', { eventId: '0'.repeat(24) }))
            .toEqual({ ok: false, error: 'Мероприятие не найдено' });
    });

    it('вход возвращает мероприятие, историю и участников; остальные получают room:joined', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        expect(await join(a, event)).toMatchObject({ ok: true, event: { title: 'Вебинар' }, history: [] });

        const joined = waitFor(a, 'room:joined');
        const i = await connectAs(ivan);
        const res = await join(i, event);
        expect(res.members.map((u) => u.email).sort()).toEqual(['anna@b.c', 'ivan@b.c']);
        expect(await joined).toMatchObject({ eventId: event.id, user: { email: 'ivan@b.c' } });
    });

    it('повторный вход в ту же комнату не объявляется', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        const i = await connectAs(ivan);
        await join(a, event);
        const joined = waitFor(a, 'room:joined');
        await join(i, event);
        await joined;
        const check = notReceived(a, 'room:joined');
        await join(i, event);
        await check;
    });

    it('выход из комнаты: room:left со списком оставшихся', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        const i = await connectAs(ivan);
        await join(a, event);
        await join(i, event);

        const left = waitFor(a, 'room:left');
        await i.emitWithAck('event:leave', { eventId: event.id });
        const data = await left;
        expect(data.user.email).toBe('ivan@b.c');
        expect(data.members.map((u) => u.email)).toEqual(['anna@b.c']);
    });

    it('при отключении участники комнаты получают room:left', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        const i = await connectAs(ivan);
        await join(a, event);
        await join(i, event);

        const left = waitFor(a, 'room:left');
        i.close();
        expect((await left).members.map((u) => u.email)).toEqual(['anna@b.c']);
    });
});

describe('Чат мероприятия', () => {
    it('нельзя писать, не войдя в комнату', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        expect(await send(a, event, 'привет')).toMatchObject({ ok: false });
    });

    it('сообщение сохраняется в MongoDB и приходит только участникам комнаты', async () => {
        const event = await newEvent();
        const other = await newEvent();
        const a = await connectAs(anna);
        const i = await connectAs(ivan);
        const outsider = await connectAs(admin);
        await join(a, event);
        await join(i, event);
        await join(outsider, other);

        const received = waitFor(i, 'chat:message');
        const check = notReceived(outsider, 'chat:message');
        const own = notReceived(a, 'chat:message');
        const ack = await send(a, event, '  Всем привет!  ');

        expect(ack).toMatchObject({ ok: true, message: { text: 'Всем привет!', email: 'anna@b.c', event: event.id } });
        expect(await received).toEqual(ack.message);
        await Promise.all([check, own]);
        expect(await Message.countDocuments({ event: event.id })).toBe(1);
    });

    it('история приходит при входе в комнату в порядке отправки', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        await join(a, event);
        await send(a, event, 'первое');
        await send(a, event, 'второе');

        const i = await connectAs(ivan);
        const res = await join(i, event);
        expect(res.history.map((m) => m.text)).toEqual(['первое', 'второе']);
    });

    it('отклоняет пустое и слишком длинное сообщение', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        await join(a, event);
        expect(await send(a, event, '   ')).toEqual({ ok: false, error: 'Пустое сообщение' });
        expect(await send(a, event, 'x'.repeat(501))).toMatchObject({ ok: false });
        expect(await Message.countDocuments()).toBe(0);
    });

    it('ограничивает частоту: не больше 5 сообщений за 5 секунд', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        await join(a, event);
        for (let n = 1; n <= 5; n++) {
            expect((await send(a, event, `сообщение ${n}`)).ok).toBe(true);
        }
        expect(await send(a, event, 'шестое')).toMatchObject({ ok: false, error: expect.stringMatching(/Слишком много/) });
    });

    it('индикатор набора передает только признак, без текста', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        const i = await connectAs(ivan);
        await join(a, event);
        await join(i, event);

        const typing = waitFor(i, 'chat:typing');
        a.emit('chat:typing', { eventId: event.id, isTyping: true });
        expect(await typing).toEqual({ eventId: event.id, user: anna, isTyping: true });
    });
});

describe('Уведомления из REST API', () => {
    const asAdmin = () => `Bearer ${tokenFor(admin)}`;

    it('создание, изменение и удаление мероприятия рассылаются всем', async () => {
        const a = await connectAs(anna);

        const created = waitFor(a, 'event:created');
        const res = await request(app).post('/events').set('Authorization', asAdmin())
            .send({ title: 'Митап', type: 'meeting', date: '2026-12-01' });
        expect(await created).toMatchObject({ event: { id: res.body.id, title: 'Митап' }, by: 'admin@b.c' });

        const updated = waitFor(a, 'event:updated');
        await request(app).put(`/events/${res.body.id}`).set('Authorization', asAdmin()).send({ title: 'Митап 2' });
        expect((await updated).event.title).toBe('Митап 2');

        const deleted = waitFor(a, 'event:deleted');
        await request(app).delete(`/events/${res.body.id}`).set('Authorization', asAdmin());
        expect(await deleted).toEqual({ id: res.body.id, title: 'Митап 2', by: 'admin@b.c' });
    });

    it('удаление мероприятия удаляет историю его чата', async () => {
        const event = await newEvent();
        const a = await connectAs(anna);
        await join(a, event);
        await send(a, event, 'привет');

        await request(app).delete(`/events/${event.id}`).set('Authorization', asAdmin());
        expect(await Message.countDocuments()).toBe(0);
    });

    it('о регистрации узнают администраторы и участники чата, но не остальные', async () => {
        const event = await newEvent();
        const adm = await connectAs(admin);
        const i = await connectAs(ivan);
        await join(i, event);
        const outsider = await connectAs({ ...anna, id: new mongoose.Types.ObjectId().toString(), email: 'x@b.c' });

        const forAdmin = waitFor(adm, 'registration:created');
        const forRoom = waitFor(i, 'registration:created');
        const check = notReceived(outsider, 'registration:created');
        await request(app).post(`/events/${event.id}/registrations`)
            .set('Authorization', `Bearer ${tokenFor(anna)}`).send({ tickets: 2 });

        const expected = { eventId: event.id, title: 'Вебинар', email: 'anna@b.c', tickets: 2, seatsLeft: 3 };
        expect(await forAdmin).toEqual(expected);
        expect(await forRoom).toEqual(expected);
        await check;
    });

    it('отмена регистрации возвращает места', async () => {
        const event = await newEvent();
        const adm = await connectAs(admin);
        const res = await request(app).post(`/events/${event.id}/registrations`)
            .set('Authorization', `Bearer ${tokenFor(anna)}`).send({ tickets: 2 });

        const cancelled = waitFor(adm, 'registration:cancelled');
        await request(app).delete(`/events/${event.id}/registrations/${res.body.id}`)
            .set('Authorization', `Bearer ${tokenFor(anna)}`);
        expect(await cancelled).toMatchObject({ email: 'anna@b.c', seatsLeft: 5 });
    });
});

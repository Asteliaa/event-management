const { useTestDB, createUser, createAdmin, createEvent, missingId } = require('./helpers');
const http = require('http');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { io: Client } = require('socket.io-client');
const app = require('../src/app');
const createSocketServer = require('../src/socket');
const scheduler = require('../src/jobs/reminderScheduler');
const { Message } = require('../src/models');

useTestDB();

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

const connect = (auth) => new Promise((resolve, reject) => {
    const socket = Client(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
    clients.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
});
const connectAs = (user) => connect({ token: user.auth.slice('Bearer '.length) });
const waitFor = (socket, name) => new Promise((resolve) => socket.once(name, resolve));
const join = (socket, event) => socket.emitWithAck('event:join', { eventId: event.id });

describe('Авторизация при подключении', () => {
    it('отклоняет подключение без токена и с недействительным токеном', async () => {
        await expect(connect({})).rejects.toThrow('Требуется авторизация');
        await expect(connect({ token: 'abc' })).rejects.toThrow('Недействительный');
        const user = await createUser();
        const expired = jwt.sign({ id: user.id }, 'test-secret', { expiresIn: -1 });
        await expect(connect({ token: expired })).rejects.toThrow('Недействительный');
    });

    it('отклоняет заблокированного пользователя и пропускает обычного', async () => {
        const blocked = await createUser({ blocked: true });
        await expect(connectAs(blocked)).rejects.toThrow('Доступ запрещен');
        const socket = await connectAs(await createUser());
        expect(socket.connected).toBe(true);
    });
});

describe('Пользователи онлайн', () => {
    it('user:connected, users:online без повторов, user:disconnected', async () => {
        const anna = await createUser({ name: 'Анна' });
        const ivan = await createUser({ name: 'Иван' });
        const a = await connectAs(anna);
        const connected = waitFor(a, 'user:connected');
        const online = waitFor(a, 'users:online');
        const i = await connectAs(ivan);
        expect(await connected).toMatchObject({ name: 'Иван' });
        expect((await online).map((u) => u.name).sort()).toEqual(['Анна', 'Иван']);
        const disconnected = waitFor(a, 'user:disconnected');
        i.close();
        expect(await disconnected).toMatchObject({ name: 'Иван' });
    });
});

describe('Чат мероприятия', () => {
    it('ошибки при некорректном и отсутствующем мероприятии', async () => {
        const a = await connectAs(await createUser());
        expect(await a.emitWithAck('event:join', { eventId: 'x' })).toMatchObject({ ok: false });
        expect(await a.emitWithAck('event:join', { eventId: missingId })).toMatchObject({ ok: false, error: 'Мероприятие не найдено' });
    });

    it('сообщение сохраняется в БД с именем автора и приходит другим участникам', async () => {
        const event = await createEvent({ title: 'Вебинар' });
        const anna = await createUser({ name: 'Анна' });
        const a = await connectAs(anna);
        const i = await connectAs(await createUser({ name: 'Иван' }));
        expect(await join(a, event)).toMatchObject({ ok: true, event: { title: 'Вебинар' }, history: [] });
        await join(i, event);

        const received = waitFor(i, 'chat:message');
        const ack = await a.emitWithAck('chat:message', { eventId: event.id, text: '  Привет!  ' });
        expect(ack).toMatchObject({ ok: true, message: { text: 'Привет!', author: 'Анна' } });
        expect(await received).toMatchObject({ text: 'Привет!', author: 'Анна' });
        expect(await Message.count({ where: { eventId: event.id } })).toBe(1);

        const history = await join(await connectAs(await createUser()), event);
        expect(history.history.map((m) => m.text)).toEqual(['Привет!']);
    });

    it('нельзя писать без входа в комнату, пустые и слишком длинные сообщения', async () => {
        const event = await createEvent();
        const a = await connectAs(await createUser());
        expect(await a.emitWithAck('chat:message', { eventId: event.id, text: 'Привет' })).toMatchObject({ ok: false });
        await join(a, event);
        expect(await a.emitWithAck('chat:message', { eventId: event.id, text: '   ' })).toMatchObject({ ok: false, error: 'Пустое сообщение' });
        expect(await a.emitWithAck('chat:message', { eventId: event.id, text: 'x'.repeat(501) })).toMatchObject({ ok: false });
    });

    it('ограничение частоты: не больше 5 сообщений за 5 секунд', async () => {
        const event = await createEvent();
        const a = await connectAs(await createUser());
        await join(a, event);
        const results = [];
        for (let n = 0; n < 6; n += 1) results.push(await a.emitWithAck('chat:message', { eventId: event.id, text: `#${n}` }));
        expect(results.filter((r) => r.ok)).toHaveLength(5);
        expect(results[5].error).toMatch(/Слишком много/);
    });
});

describe('Уведомления в реальном времени', () => {
    it('регистрация на мероприятие уведомляет администраторов', async () => {
        const admin = await createAdmin();
        const user = await createUser({ name: 'Анна' });
        const event = await createEvent({ title: 'DevDay', capacity: 10 });
        const s = await connectAs(admin);
        const received = waitFor(s, 'registration:created');
        await request(app).post(`/api/v1/events/${event.id}/registrations`).set('Authorization', user.auth).send({ tickets: 2 });
        expect(await received).toMatchObject({ title: 'DevDay', name: 'Анна', tickets: 2, seatsLeft: 8 });
    });

    it('создание мероприятия получают все подключенные клиенты', async () => {
        const admin = await createAdmin({ name: 'Организатор' });
        const s = await connectAs(await createUser());
        const received = waitFor(s, 'event:created');
        await request(app).post('/api/v1/events').set('Authorization', admin.auth)
            .send({ title: 'Новое мероприятие', type: 'meeting', startsAt: new Date(Date.now() + 864e5).toISOString() });
        expect(await received).toMatchObject({ event: { title: 'Новое мероприятие' }, by: 'Организатор' });
    });

    it('напоминание приходит во все вкладки пользователя, но не другим', async () => {
        const user = await createUser();
        const other = await createUser();
        const event = await createEvent({ title: 'Скоро начнется', startsAt: new Date(Date.now() + 20 * 60e3) });
        await request(app).post('/api/v1/reminders').set('Authorization', user.auth).send({ event: event.id, offsetMinutes: 15 });
        const tab1 = await connectAs(user);
        const tab2 = await connectAs(user);
        const stranger = await connectAs(other);
        let strangerGot = false;
        stranger.on('reminder:due', () => { strangerGot = true; });

        const got = Promise.all([waitFor(tab1, 'reminder:due'), waitFor(tab2, 'reminder:due')]);
        await scheduler.runOnce(new Date(Date.now() + 6 * 60e3));
        const [r1, r2] = await got;
        expect(r1).toMatchObject({ offsetMinutes: 15, event: { title: 'Скоро начнется' } });
        expect(r2.id).toBe(r1.id);
        await new Promise((r) => setTimeout(r, 100));
        expect(strangerGot).toBe(false);
    });
});

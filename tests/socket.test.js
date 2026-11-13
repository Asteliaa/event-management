const { useTestDB, createUser, createAdmin, createOrganizer, registerUser, createEvent, missingId } = require('./helpers');
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
        const ivan = await createUser({ name: 'Иван' });
        await registerUser(event, anna);
        await registerUser(event, ivan);
        const a = await connectAs(anna);
        const i = await connectAs(ivan);
        expect(await join(a, event)).toMatchObject({ ok: true, event: { title: 'Вебинар' }, history: [], readOnly: false });
        await join(i, event);

        const received = waitFor(i, 'chat:message');
        const ack = await a.emitWithAck('chat:message', { eventId: event.id, text: '  Привет!  ' });
        expect(ack).toMatchObject({ ok: true, message: { text: 'Привет!', author: 'Анна' } });
        expect(await received).toMatchObject({ text: 'Привет!', author: 'Анна' });
        expect(await Message.count({ where: { eventId: event.id } })).toBe(1);

        const late = await createUser();
        await registerUser(event, late);
        const history = await join(await connectAs(late), event);
        expect(history.history.map((m) => m.text)).toEqual(['Привет!']);
    });

    it('нельзя писать без входа в комнату, пустые и слишком длинные сообщения', async () => {
        const event = await createEvent();
        const user = await createUser();
        await registerUser(event, user);
        const a = await connectAs(user);
        expect(await a.emitWithAck('chat:message', { eventId: event.id, text: 'Привет' })).toMatchObject({ ok: false });
        await join(a, event);
        expect(await a.emitWithAck('chat:message', { eventId: event.id, text: '   ' })).toMatchObject({ ok: false, error: 'Пустое сообщение' });
        expect(await a.emitWithAck('chat:message', { eventId: event.id, text: 'x'.repeat(501) })).toMatchObject({ ok: false });
    });

    it('ограничение частоты: не больше 5 сообщений за 5 секунд', async () => {
        const event = await createEvent();
        const user = await createUser();
        await registerUser(event, user);
        const a = await connectAs(user);
        await join(a, event);
        const results = [];
        for (let n = 0; n < 6; n += 1) results.push(await a.emitWithAck('chat:message', { eventId: event.id, text: `#${n}` }));
        expect(results.filter((r) => r.ok)).toHaveLength(5);
        expect(results[5].error).toMatch(/Слишком много/);
    });
});

describe('Права доступа к чату', () => {
    it('вход из второй вкладки того же пользователя не объявляется в комнате', async () => {
        const event = await createEvent();
        const anna = await createUser();
        const ivan = await createUser();
        await registerUser(event, anna);
        await registerUser(event, ivan);
        const i = await connectAs(ivan);
        await join(i, event);
        const announced = [];
        i.on('room:joined', (d) => announced.push(d.user.id));
        await join(await connectAs(anna), event);
        await join(await connectAs(anna), event);
        await new Promise((r) => setTimeout(r, 100));
        expect(announced).toEqual([anna.id]);
    });

    it('постороннему и гостю – нет доступа; черновик – только владелец и администратор', async () => {
        const organizer = await createOrganizer();
        const event = await createEvent({ organizerId: organizer.id });
        const draft = await createEvent({ organizerId: organizer.id, status: 'draft' });
        const stranger = await connectAs(await createUser());
        expect(await join(stranger, event)).toMatchObject({ ok: false, error: 'Чат доступен участникам мероприятия' });
        expect(await join(stranger, draft)).toMatchObject({ ok: false, error: 'Мероприятие не найдено' });
        const o = await connectAs(organizer);
        expect(await join(o, event)).toMatchObject({ ok: true, readOnly: false });
        expect(await join(o, draft)).toMatchObject({ ok: true });
        expect(await join(await connectAs(await createAdmin()), draft)).toMatchObject({ ok: true });
        // чужой организатор не управляет мероприятием
        expect(await join(await connectAs(await createOrganizer()), event)).toMatchObject({ ok: false });
    });

    it('отмена участия: открытое соединение выходит из комнаты и не может писать; новый вход запрещен', async () => {
        const event = await createEvent();
        const user = await createUser();
        const other = await createUser();
        const { registration } = await registerUser(event, user);
        await registerUser(event, other);
        const a = await connectAs(user);
        const b = await connectAs(other);
        await join(a, event);
        await join(b, event);

        const revoked = waitFor(a, 'chat:revoked');
        const res = await request(app).delete(`/api/v1/registrations/${registration.id}`).set('Authorization', user.auth);
        expect(res.status).toBe(200);
        expect(await revoked).toEqual({ eventId: event.id, reason: 'registration_cancelled' });

        let bGot = false;
        b.on('chat:message', () => { bGot = true; });
        expect(await a.emitWithAck('chat:message', { eventId: event.id, text: 'Я еще тут?' })).toMatchObject({ ok: false });
        expect(await join(a, event)).toMatchObject({ ok: false });
        await new Promise((r) => setTimeout(r, 100));
        expect(bGot).toBe(false);
        expect(await Message.count()).toBe(0);
    });

    it('проверка на каждом сообщении: регистрацию отменили в обход сокет-уведомления', async () => {
        const event = await createEvent();
        const user = await createUser();
        const { registration } = await registerUser(event, user);
        const a = await connectAs(user);
        await join(a, event);
        await registration.update({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'admin' });
        expect(await a.emitWithAck('chat:message', { eventId: event.id, text: 'Привет' }))
            .toMatchObject({ ok: false, revoked: true });
    });

    it('отмена мероприятия: история доступна, писать нельзя ни участникам, ни организатору', async () => {
        const organizer = await createOrganizer();
        const event = await createEvent({ organizerId: organizer.id });
        const user = await createUser();
        await registerUser(event, user);
        const a = await connectAs(user);
        await join(a, event);
        await a.emitWithAck('chat:message', { eventId: event.id, text: 'До отмены' });

        const readonly = waitFor(a, 'chat:readonly');
        const res = await request(app).post(`/api/v1/events/${event.id}/cancel`).set('Authorization', organizer.auth)
            .send({ reason: 'Докладчик заболел' });
        expect(res.status).toBe(200);
        expect(await readonly).toEqual({ eventId: event.id });
        expect(await a.emitWithAck('chat:message', { eventId: event.id, text: 'После' })).toMatchObject({ ok: false, readOnly: true });

        const again = await join(await connectAs(user), event);
        expect(again).toMatchObject({ ok: true, readOnly: true });
        expect(again.history.map((m) => m.text)).toEqual(['До отмены']);
        const o = await connectAs(organizer);
        expect(await join(o, event)).toMatchObject({ ok: true, readOnly: true });
        expect(await o.emitWithAck('chat:message', { eventId: event.id, text: 'Орг' })).toMatchObject({ ok: false, readOnly: true });
    });

    it('передача мероприятия другому организатору закрывает чат прежнему владельцу', async () => {
        const admin = await createAdmin();
        const before = await createOrganizer();
        const after = await createOrganizer();
        const event = await createEvent({ organizerId: before.id });
        const s = await connectAs(before);
        await join(s, event);
        const revoked = waitFor(s, 'chat:revoked');
        const res = await request(app).patch(`/api/v1/events/${event.id}`).set('Authorization', admin.auth).send({ organizer: after.id });
        expect(res.status).toBe(200);
        expect(await revoked).toEqual({ eventId: event.id, reason: 'ownership_transferred' });
        expect(await join(s, event)).toMatchObject({ ok: false });
    });

    it('блокировка и деактивация завершают открытые соединения, переподключиться со старым токеном нельзя', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const s = await connectAs(user);
        const gone = waitFor(s, 'disconnect');
        await request(app).patch(`/api/v1/admin/users/${user.id}`).set('Authorization', admin.auth).send({ blocked: true });
        expect(await gone).toBe('io server disconnect');
        await expect(connectAs(user)).rejects.toThrow('Доступ запрещен');

        const other = await createUser();
        const t = await connectAs(other);
        const gone2 = waitFor(t, 'disconnect');
        await request(app).post('/api/v1/auth/me/deactivate').set('Authorization', other.auth).send({ password: 'secret123' });
        expect(await gone2).toBe('io server disconnect');
    });
});

describe('Уведомления в реальном времени', () => {
    it('регистрация на мероприятие уведомляет администраторов', async () => {
        const admin = await createAdmin();
        const user = await createUser({ name: 'Анна' });
        const event = await createEvent({ title: 'DevDay', capacity: 10 });
        const s = await connectAs(admin);
        const received = waitFor(s, 'registration:created');
        await request(app).post(`/api/v1/events/${event.id}/registrations`).set('Authorization', user.auth).send({});
        expect(await received).toMatchObject({ title: 'DevDay', name: 'Анна', seatsLeft: 9 });
    });

    it('создание мероприятия получают все подключенные клиенты', async () => {
        const admin = await createAdmin({ name: 'Организатор' });
        const s = await connectAs(await createUser());
        const received = waitFor(s, 'event:created');
        await request(app).post('/api/v1/events').set('Authorization', admin.auth)
            .send({
                title: 'Новое мероприятие', type: 'meeting', timezone: 'Europe/Minsk', status: 'published',
                startsAt: new Date(Date.now() + 864e5).toISOString(), endsAt: new Date(Date.now() + 866e5).toISOString(),
                location: { online: true, url: 'https://meet.example.com/secret-room' }
            });
        const payload = await received;
        expect(payload).toMatchObject({ event: { title: 'Новое мероприятие' }, by: 'Организатор' });
        // ссылка подключения не рассылается всем клиентам
        expect(JSON.stringify(payload)).not.toContain('secret-room');
    });

    it('напоминание приходит во все вкладки пользователя, но не другим', async () => {
        const user = await createUser();
        const other = await createUser();
        const event = await createEvent({ title: 'Скоро начнется', startsAt: new Date(Date.now() + 20 * 60e3) });
        await registerUser(event, user);
        await request(app).post('/api/v1/reminders').set('Authorization', user.auth).send({ event: event.id, offsetMinutes: 15 });
        const tab1 = await connectAs(user);
        const tab2 = await connectAs(user);
        const stranger = await connectAs(other);
        let strangerGot = false;
        stranger.on('notification:new', () => { strangerGot = true; });

        const got = Promise.all([waitFor(tab1, 'notification:new'), waitFor(tab2, 'notification:new')]);
        await scheduler.runOnce(new Date(Date.now() + 6 * 60e3));
        const [r1, r2] = await got;
        expect(r1).toMatchObject({ type: 'reminder', payload: { offsetMinutes: 15 }, event: { title: 'Скоро начнется' } });
        expect(r2.id).toBe(r1.id);
        await new Promise((r) => setTimeout(r, 100));
        expect(strangerGot).toBe(false);
    });
});

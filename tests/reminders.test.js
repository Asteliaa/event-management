const { useTestDB, createUser, createEvent, inDays, missingId } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { Reminder, Event } = require('../src/models');
const scheduler = require('../src/jobs/reminderScheduler');
const notify = require('../src/socket/notify');

useTestDB();

const api = '/api/v1/reminders';
const create = (user, body) => request(app).post(api).set('Authorization', user.auth).send(body);

describe('CRUD напоминаний', () => {
    it('201: время напоминания = начало − offsetMinutes', async () => {
        const user = await createUser();
        const event = await createEvent({ startsAt: inDays(3) });
        const res = await create(user, { event: event.id, offsetMinutes: 120 });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ offsetMinutes: 120, kind: 'custom', status: 'pending', event: { title: event.title } });
        expect(new Date(res.body.remindAt).getTime()).toBe(event.startsAt.getTime() - 120 * 60e3);
    });

    it('400, если время уже прошло; 409 для дубликата; 404 для отсутствующего мероприятия', async () => {
        const user = await createUser();
        const event = await createEvent({ startsAt: new Date(Date.now() + 30 * 60e3) });
        expect((await create(user, { event: event.id, offsetMinutes: 60 })).status).toBe(400);
        expect((await create(user, { event: event.id, offsetMinutes: 10 })).status).toBe(201);
        const dup = await create(user, { event: event.id, offsetMinutes: 10 });
        expect(dup.status).toBe(409);
        expect((await create(user, { event: missingId, offsetMinutes: 10 })).status).toBe(404);
    });

    it('422 при слишком маленьком интервале', async () => {
        const user = await createUser();
        const event = await createEvent();
        expect((await create(user, { event: event.id, offsetMinutes: 1 })).status).toBe(422);
    });

    it('список своих напоминаний, чужие не видны и недоступны', async () => {
        const anna = await createUser();
        const ivan = await createUser();
        const event = await createEvent();
        const mine = (await create(anna, { event: event.id, offsetMinutes: 60 })).body;
        await create(ivan, { event: event.id, offsetMinutes: 30 });

        const list = await request(app).get(api).set('Authorization', anna.auth);
        expect(list.body.map((r) => r.id)).toEqual([mine.id]);
        expect((await request(app).delete(`${api}/${mine.id}`).set('Authorization', ivan.auth)).status).toBe(404);
    });

    it('PATCH меняет интервал (kind становится custom), DELETE удаляет', async () => {
        const user = await createUser();
        const event = await createEvent();
        const r = (await create(user, { event: event.id, offsetMinutes: 60 })).body;
        const upd = await request(app).patch(`${api}/${r.id}`).set('Authorization', user.auth).send({ offsetMinutes: 180 });
        expect(new Date(upd.body.remindAt).getTime()).toBe(event.startsAt.getTime() - 180 * 60e3);
        expect((await request(app).delete(`${api}/${r.id}`).set('Authorization', user.auth)).status).toBe(204);
        expect(await Reminder.count()).toBe(0);
    });
});

describe('Планировщик напоминаний', () => {
    afterEach(() => notify.setIO(null));

    it('отправляет наступившие напоминания один раз в личную комнату пользователя', async () => {
        const user = await createUser();
        const event = await createEvent({ startsAt: new Date(Date.now() + 20 * 60e3) });
        await create(user, { event: event.id, offsetMinutes: 15 });   // через 5 минут
        await create(user, { event: event.id, offsetMinutes: 5 });    // через 15 минут

        const emitted = [];
        notify.setIO({ to: (rooms) => ({ emit: (name, payload) => emitted.push({ rooms, name, payload }) }) });

        expect(await scheduler.runOnce()).toBe(0);
        const later = new Date(Date.now() + 6 * 60e3);
        expect(await scheduler.runOnce(later)).toBe(1);
        expect(await scheduler.runOnce(later)).toBe(0);      // повторно не отправляется

        expect(emitted).toHaveLength(1);
        expect(emitted[0]).toMatchObject({
            rooms: [`user:${user.id}`],
            name: 'reminder:due',
            payload: { offsetMinutes: 15, status: 'sent', event: { title: event.title } }
        });
    });

    it('центр уведомлений: непрочитанные, отметка прочитанным и «прочитать все»', async () => {
        const user = await createUser();
        const event = await createEvent({ startsAt: new Date(Date.now() + 20 * 60e3) });
        await create(user, { event: event.id, offsetMinutes: 15 });
        await create(user, { event: event.id, offsetMinutes: 10 });
        await scheduler.runOnce(new Date(Date.now() + 11 * 60e3));

        const unread = await request(app).get(`${api}?unread=true`).set('Authorization', user.auth);
        expect(unread.body).toHaveLength(2);
        await request(app).patch(`${api}/${unread.body[0].id}`).set('Authorization', user.auth).send({ read: true });
        expect((await request(app).get(`${api}?unread=true`).set('Authorization', user.auth)).body).toHaveLength(1);

        const all = await request(app).post(`${api}/read-all`).set('Authorization', user.auth);
        expect(all.body.updated).toBe(1);
        expect((await request(app).get(`${api}?unread=true`).set('Authorization', user.auth)).body).toHaveLength(0);
    });

    it('отправленное напоминание нельзя перенести', async () => {
        const user = await createUser();
        const event = await createEvent({ startsAt: new Date(Date.now() + 20 * 60e3) });
        const r = (await create(user, { event: event.id, offsetMinutes: 15 })).body;
        await scheduler.runOnce(new Date(Date.now() + 6 * 60e3));
        const res = await request(app).patch(`${api}/${r.id}`).set('Authorization', user.auth).send({ offsetMinutes: 10 });
        expect(res.status).toBe(400);
    });

    it('не отправляет напоминания об отмененном мероприятии', async () => {
        const user = await createUser();
        const event = await createEvent({ startsAt: new Date(Date.now() + 20 * 60e3) });
        const other = await createEvent({ startsAt: new Date(Date.now() + 20 * 60e3) });
        await create(user, { event: event.id, offsetMinutes: 15 });
        await create(user, { event: other.id, offsetMinutes: 15 });
        await Event.update({ status: 'cancelled' }, { where: { id: event.id } });

        const emitted = [];
        notify.setIO({ to: (rooms) => ({ emit: (name, payload) => emitted.push(payload) }) });
        const later = new Date(Date.now() + 6 * 60e3);
        expect(await scheduler.runOnce(later)).toBe(1);
        expect(emitted.map((p) => p.event.id)).toEqual([other.id]);
        // напоминание отмененного мероприятия не помечено отправленным и не попадает в центр уведомлений
        expect((await Reminder.findOne({ where: { eventId: event.id } })).status).toBe('pending');
        expect((await request(app).get(`${api}?unread=true`).set('Authorization', user.auth)).body).toHaveLength(1);
    });

    it('start() запускает периодическую проверку и возвращает функцию остановки', async () => {
        const stop = scheduler.start(10_000);
        expect(typeof stop).toBe('function');
        stop();
    });
});

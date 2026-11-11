const { useTestDB, createUser, createAdmin, createEvent, inDays, missingId } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { Event, Registration, Reminder } = require('../src/models');

useTestDB();

const register = (event, user, body = {}) =>
    request(app).post(`/api/v1/events/${event.id}/registrations`).set('Authorization', user.auth).send(body);
const seats = async (event) => (await Event.findByPk(event.id)).seatsTaken;

describe('POST /events/:id/registrations', () => {
    it('201: регистрация, занятые места и автоматическое напоминание за сутки', async () => {
        const user = await createUser();
        const event = await createEvent({ capacity: 10, startsAt: inDays(5) });
        const res = await register(event, user, { tickets: 3, comment: 'Буду с коллегами' });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ tickets: 3, status: 'registered', comment: 'Буду с коллегами' });
        expect(res.body.autoReminder).toMatchObject({ offsetMinutes: 1440, kind: 'auto', status: 'pending' });
        expect(await seats(event)).toBe(3);
    });

    it('если до начала меньше суток – напоминание за час, меньше часа – без напоминания', async () => {
        const user = await createUser();
        const soon = await createEvent({ startsAt: new Date(Date.now() + 5 * 3600e3) });
        expect((await register(soon, user)).body.autoReminder.offsetMinutes).toBe(60);
        const verySoon = await createEvent({ startsAt: new Date(Date.now() + 30 * 60e3) });
        expect((await register(verySoon, user)).body.autoReminder).toBeNull();
    });

    it('409 при повторной регистрации', async () => {
        const user = await createUser();
        const event = await createEvent();
        await register(event, user);
        const res = await register(event, user);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('ALREADY_REGISTERED');
    });

    it('409 NO_SEATS, если мест не хватает', async () => {
        const event = await createEvent({ capacity: 3 });
        await register(event, await createUser(), { tickets: 2 });
        const res = await register(event, await createUser(), { tickets: 2 });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatchObject({ code: 'NO_SEATS', message: expect.stringContaining('свободно 1') });
    });

    it('параллельные запросы не превышают вместимость (атомарное бронирование)', async () => {
        const event = await createEvent({ capacity: 5 });
        const users = await Promise.all(Array.from({ length: 10 }, () => createUser()));
        const results = await Promise.all(users.map((u) => register(event, u)));
        expect(results.filter((r) => r.status === 201)).toHaveLength(5);
        expect(await seats(event)).toBe(5);
        expect(await Registration.count()).toBe(5);
    });

    it('409 для прошедшего и отмененного мероприятия, 404 для отсутствующего', async () => {
        const user = await createUser();
        expect((await register(await createEvent({ startsAt: inDays(-1) }), user)).body.error.code).toBe('EVENT_PAST');
        expect((await register(await createEvent({ status: 'cancelled' }), user)).body.error.code).toBe('EVENT_CANCELLED');
        expect((await register({ id: missingId }, user)).status).toBe(404);
    });

    it('422 при некорректном числе билетов, 401 без токена', async () => {
        const event = await createEvent();
        expect((await register(event, await createUser(), { tickets: 0 })).status).toBe(422);
        expect((await register(event, await createUser(), { tickets: 11 })).status).toBe(422);
        expect((await request(app).post(`/api/v1/events/${event.id}/registrations`)).status).toBe(401);
    });
});

describe('PATCH и DELETE /registrations/:id', () => {
    const setup = async (capacity = 5) => {
        const user = await createUser();
        const event = await createEvent({ capacity });
        const reg = (await register(event, user, { tickets: 2 })).body;
        return { user, event, reg };
    };

    it('владелец изменяет число билетов, места пересчитываются', async () => {
        const { user, event, reg } = await setup();
        const up = await request(app).patch(`/api/v1/registrations/${reg.id}`).set('Authorization', user.auth).send({ tickets: 4 });
        expect(up.status).toBe(200);
        expect(up.body.event).toMatchObject({ title: event.title });
        expect(await seats(event)).toBe(4);
        await request(app).patch(`/api/v1/registrations/${reg.id}`).set('Authorization', user.auth).send({ tickets: 1 });
        expect(await seats(event)).toBe(1);
    });

    it('409, если увеличение превышает вместимость', async () => {
        const { user, reg } = await setup(3);
        const res = await request(app).patch(`/api/v1/registrations/${reg.id}`).set('Authorization', user.auth).send({ tickets: 4 });
        expect(res.status).toBe(409);
    });

    it('чужую регистрацию изменить нельзя (403), администратор может отметить посещение', async () => {
        const { reg } = await setup();
        const other = await createUser();
        const admin = await createAdmin();
        expect((await request(app).patch(`/api/v1/registrations/${reg.id}`).set('Authorization', other.auth).send({ tickets: 1 })).status).toBe(403);
        const res = await request(app).patch(`/api/v1/registrations/${reg.id}`).set('Authorization', admin.auth).send({ status: 'attended' });
        expect(res.body.status).toBe('attended');
    });

    it('пользователь не может сам поставить attended', async () => {
        const { user, reg } = await setup();
        const res = await request(app).patch(`/api/v1/registrations/${reg.id}`).set('Authorization', user.auth).send({ status: 'attended' });
        expect(res.status).toBe(403);
    });

    it('отмена освобождает места и удаляет неотправленные напоминания; затем можно зарегистрироваться снова', async () => {
        const { user, event, reg } = await setup();
        const res = await request(app).delete(`/api/v1/registrations/${reg.id}`).set('Authorization', user.auth);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('cancelled');
        expect(await seats(event)).toBe(0);
        expect(await Reminder.count({ where: { userId: user.id } })).toBe(0);

        const again = await register(event, user, { tickets: 1 });
        expect(again.status).toBe(201);
        expect(again.body.id).toBe(reg.id);
        expect(await seats(event)).toBe(1);
    });

    it('404 для отсутствующей регистрации', async () => {
        const user = await createUser();
        expect((await request(app).delete(`/api/v1/registrations/${missingId}`).set('Authorization', user.auth)).status).toBe(404);
    });
});

describe('Мои регистрации и список участников', () => {
    it('GET /auth/me/registrations – активные, по дате мероприятия', async () => {
        const user = await createUser();
        const later = await createEvent({ title: 'Позже', startsAt: inDays(20) });
        const sooner = await createEvent({ title: 'Раньше', startsAt: inDays(2) });
        const cancelled = await createEvent({ title: 'Отменю' });
        await register(later, user);
        await register(sooner, user);
        const reg = (await register(cancelled, user)).body;
        await request(app).delete(`/api/v1/registrations/${reg.id}`).set('Authorization', user.auth);

        const res = await request(app).get('/api/v1/auth/me/registrations').set('Authorization', user.auth);
        expect(res.body.map((r) => r.event.title)).toEqual(['Раньше', 'Позже']);
    });

    it('администратор получает участников в JSON и CSV', async () => {
        const admin = await createAdmin();
        const user = await createUser({ name: 'Анна; Петрова' });
        const event = await createEvent();
        await register(event, user, { tickets: 2 });

        const json = await request(app).get(`/api/v1/events/${event.id}/registrations`).set('Authorization', admin.auth);
        expect(json.body[0]).toMatchObject({ tickets: 2, user: { name: 'Анна; Петрова', email: user.email } });

        const csv = await request(app).get(`/api/v1/events/${event.id}/registrations?format=csv`).set('Authorization', admin.auth);
        expect(csv.headers['content-type']).toMatch('text/csv');
        expect(csv.text).toContain('Имя;Email;Билетов');
        expect(csv.text).toContain('"Анна; Петрова"');

        expect((await request(app).get(`/api/v1/events/${event.id}/registrations`).set('Authorization', user.auth)).status).toBe(403);
    });
});

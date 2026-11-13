// Согласованность счетчика мест и регистраций в PostgreSQL:
// events.seats_taken всегда равен числу активных регистраций мероприятия (одна регистрация – одно место)
const { useTestDB, createUser, createAdmin, createEvent } = require('./helpers');
const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../src/app');
const { sequelize, Event, Registration, Reminder } = require('../src/models');
const reminderService = require('../src/services/reminder.service');

useTestDB();

const register = (event, user, body = {}) =>
    request(app).post(`/api/v1/events/${event.id}/registrations`).set('Authorization', user.auth).send(body);
const cancel = (id, user) => request(app).delete(`/api/v1/registrations/${id}`).set('Authorization', user.auth);

// Расхождения «счетчик ≠ число активных регистраций» по всем мероприятиям
const mismatches = () => sequelize.query(
    `SELECT e.id, e.seats_taken, count(r.id) FILTER (WHERE r.status <> 'cancelled')::int AS active
     FROM events e LEFT JOIN registrations r ON r.event_id = e.id
     GROUP BY e.id HAVING e.seats_taken <> count(r.id) FILTER (WHERE r.status <> 'cancelled')`,
    { type: QueryTypes.SELECT }
);

// Пары (мероприятие, пользователь) с несколькими активными регистрациями
const duplicates = () => sequelize.query(
    `SELECT event_id, user_id, count(*)::int FROM registrations WHERE status <> 'cancelled'
     GROUP BY event_id, user_id HAVING count(*) > 1`,
    { type: QueryTypes.SELECT }
);

describe('Счетчик мест и регистрации', () => {
    afterEach(() => jest.restoreAllMocks());

    it('после параллельных регистраций, отмен и повторных записей счетчик равен числу активных регистраций', async () => {
        const event = await createEvent({ capacity: 6 });
        const users = await Promise.all(Array.from({ length: 9 }, () => createUser()));

        // 9 человек на 6 мест: успешны ровно 6
        const first = await Promise.all(users.map((u) => register(event, u)));
        const ok = first.map((res, i) => ({ res, user: users[i] })).filter(({ res }) => res.status === 201);
        expect(ok).toHaveLength(6);

        // одновременно: часть отменяет, отказавшие пробуют снова, отменивший записывается повторно
        const losers = first.map((res, i) => ({ res, user: users[i] })).filter(({ res }) => res.status !== 201);
        await Promise.all([
            cancel(ok[0].res.body.id, ok[0].user),
            cancel(ok[1].res.body.id, ok[1].user),
            ...losers.map(({ user }) => register(event, user)),
            register(event, ok[0].user),
            register(event, ok[0].user)
        ]);

        expect(await mismatches()).toEqual([]);
        expect(await duplicates()).toEqual([]);
        const fresh = await Event.findByPk(event.id);
        expect(fresh.seatsTaken).toBeLessThanOrEqual(6);
    });

    it('двойная отмена одной регистрации освобождает место один раз', async () => {
        const user = await createUser();
        const event = await createEvent({ capacity: 5 });
        await register(event, await createUser());
        const reg = (await register(event, user)).body;
        const results = await Promise.all([cancel(reg.id, user), cancel(reg.id, user), cancel(reg.id, user)]);
        expect(results.every((r) => r.status === 200)).toBe(true);
        expect((await Event.findByPk(event.id)).seatsTaken).toBe(1);
        expect(await mismatches()).toEqual([]);
    });

    it('одновременные регистрации одного пользователя: одна активная запись, место занято один раз', async () => {
        const user = await createUser();
        const event = await createEvent({ capacity: 10 });
        const results = await Promise.all(Array.from({ length: 5 }, () => register(event, user)));
        expect(results.filter((r) => r.status === 201)).toHaveLength(1);
        expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'ALREADY_REGISTERED')).toBe(true);
        expect(await Registration.count()).toBe(1);
        expect((await Event.findByPk(event.id)).seatsTaken).toBe(1);
    });

    it('БД не допускает вторую активную регистрацию той же пары, но допускает новую после отмены', async () => {
        const user = await createUser();
        const event = await createEvent();
        await Registration.create({ eventId: event.id, userId: user.id, status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'user' });
        await Registration.create({ eventId: event.id, userId: user.id });
        await expect(Registration.create({ eventId: event.id, userId: user.id }))
            .rejects.toMatchObject({ parent: { constraint: 'registrations_active_event_user_key' } });
    });

    it('ошибка после брони места откатывает всю регистрацию (транзакция)', async () => {
        const user = await createUser();
        const event = await createEvent({ capacity: 5 });
        jest.spyOn(reminderService, 'createAuto').mockRejectedValueOnce(new Error('сбой'));
        const res = await register(event, user);
        expect(res.status).toBe(500);
        expect((await Event.findByPk(event.id)).seatsTaken).toBe(0);
        expect(await Registration.count()).toBe(0);
        expect(await Reminder.count()).toBe(0);
    });

    it('удаление пользователя возвращает места на все его мероприятия', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const other = await createUser();
        const a = await createEvent({ capacity: 10 });
        const b = await createEvent({ capacity: 10 });
        await register(a, user);
        await register(b, user);
        await register(a, other);
        await request(app).delete(`/api/v1/admin/users/${user.id}`).set('Authorization', admin.auth);
        expect((await Event.findByPk(a.id)).seatsTaken).toBe(1);
        expect((await Event.findByPk(b.id)).seatsTaken).toBe(0);
        expect(await mismatches()).toEqual([]);
    });
});

describe('Ограничения схемы', () => {
    it('БД не допускает отрицательный счетчик и превышение вместимости', async () => {
        const event = await createEvent({ capacity: 2 });
        await expect(Event.update({ seatsTaken: 3 }, { where: { id: event.id } }))
            .rejects.toMatchObject({ parent: { constraint: 'events_seats_within_capacity' } });
        await expect(Event.update({ seatsTaken: -1 }, { where: { id: event.id }, validate: false }))
            .rejects.toMatchObject({ parent: { constraint: 'events_seats_non_negative' } });
    });

    it('PATCH мероприятия: окончание раньше уже сохраненного начала – 422, а не ошибка БД', async () => {
        const admin = await createAdmin();
        const event = await createEvent({ startsAt: new Date(Date.now() + 5 * 864e5) });
        const res = await request(app).patch(`/api/v1/events/${event.id}`).set('Authorization', admin.auth)
            .send({ endsAt: new Date(Date.now() + 864e5).toISOString() });
        expect(res.status).toBe(422);
        expect(res.body.error.details[0].field).toBe('body.endsAt');
    });

    it('ссылка на несуществующую категорию – 422', async () => {
        const admin = await createAdmin();
        const res = await request(app).post('/api/v1/events').set('Authorization', admin.auth)
            .send({ title: 'Без категории', type: 'webinar', startsAt: new Date(Date.now() + 864e5).toISOString(), category: '999999' });
        expect(res.status).toBe(422);
    });

    it('идентификаторы в API – строки; id в старом формате ObjectId отклоняется', async () => {
        const event = await createEvent();
        const res = await request(app).get(`/api/v1/events/${event.id}`);
        expect(typeof res.body.id).toBe('string');
        expect((await request(app).get('/api/v1/events/507f1f77bcf86cd799439011')).status).toBe(422);
        expect((await request(app).get('/api/v1/events/99999999999999999999')).status).toBe(422);
    });
});

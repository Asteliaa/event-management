// Согласованность счетчика мест и регистраций в PostgreSQL:
// events.seats_taken всегда равен сумме билетов активных регистраций мероприятия
const { useTestDB, createUser, createAdmin, createEvent } = require('./helpers');
const request = require('supertest');
const { QueryTypes } = require('sequelize');
const app = require('../src/app');
const { sequelize, Event, Registration, Reminder } = require('../src/models');
const reminderService = require('../src/services/reminder.service');

useTestDB();

const register = (event, user, body = {}) =>
    request(app).post(`/api/v1/events/${event.id}/registrations`).set('Authorization', user.auth).send(body);
const patch = (id, user, body) => request(app).patch(`/api/v1/registrations/${id}`).set('Authorization', user.auth).send(body);
const cancel = (id, user) => request(app).delete(`/api/v1/registrations/${id}`).set('Authorization', user.auth);

// Расхождения «счетчик ≠ сумма активных билетов» по всем мероприятиям
const mismatches = () => sequelize.query(
    `SELECT e.id, e.seats_taken, coalesce(sum(r.tickets) FILTER (WHERE r.status <> 'cancelled'), 0)::int AS active
     FROM events e LEFT JOIN registrations r ON r.event_id = e.id
     GROUP BY e.id HAVING e.seats_taken <> coalesce(sum(r.tickets) FILTER (WHERE r.status <> 'cancelled'), 0)`,
    { type: QueryTypes.SELECT }
);

describe('Счетчик мест и регистрации', () => {
    afterEach(() => jest.restoreAllMocks());

    it('после параллельных регистраций, изменений и отмен счетчик равен сумме активных билетов', async () => {
        const event = await createEvent({ capacity: 12 });
        const users = await Promise.all(Array.from({ length: 8 }, () => createUser()));

        // 8 человек по 2 билета на 12 мест: успешны ровно 6
        const first = await Promise.all(users.map((u) => register(event, u, { tickets: 2 })));
        const ok = first.map((res, i) => ({ res, user: users[i] })).filter(({ res }) => res.status === 201);
        expect(ok).toHaveLength(6);

        // одновременно: часть отменяет, часть меняет число билетов, отказавшие пробуют снова
        const losers = first.map((res, i) => ({ res, user: users[i] })).filter(({ res }) => res.status !== 201);
        await Promise.all([
            cancel(ok[0].res.body.id, ok[0].user),
            cancel(ok[1].res.body.id, ok[1].user),
            patch(ok[2].res.body.id, ok[2].user, { tickets: 4 }),
            patch(ok[3].res.body.id, ok[3].user, { tickets: 1 }),
            ...losers.map(({ user }) => register(event, user, { tickets: 3 })),
            // повторная регистрация отменившего – параллельно с его же отменой
            register(event, ok[0].user, { tickets: 1 })
        ]);

        expect(await mismatches()).toEqual([]);
        const fresh = await Event.findByPk(event.id);
        expect(fresh.seatsTaken).toBeLessThanOrEqual(12);
    });

    it('двойная отмена одной регистрации освобождает места один раз', async () => {
        const user = await createUser();
        const event = await createEvent({ capacity: 5 });
        const reg = (await register(event, user, { tickets: 3 })).body;
        const results = await Promise.all([cancel(reg.id, user), cancel(reg.id, user), cancel(reg.id, user)]);
        expect(results.every((r) => r.status === 200)).toBe(true);
        expect((await Event.findByPk(event.id)).seatsTaken).toBe(0);
        expect(await mismatches()).toEqual([]);
    });

    it('одновременные повторные регистрации одного пользователя: одна запись, места заняты один раз', async () => {
        const user = await createUser();
        const event = await createEvent({ capacity: 10 });
        const results = await Promise.all(Array.from({ length: 5 }, () => register(event, user, { tickets: 2 })));
        expect(results.filter((r) => r.status === 201)).toHaveLength(1);
        expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'ALREADY_REGISTERED')).toBe(true);
        expect(await Registration.count()).toBe(1);
        expect((await Event.findByPk(event.id)).seatsTaken).toBe(2);
    });

    it('ошибка после брони мест откатывает всю регистрацию (транзакция)', async () => {
        const user = await createUser();
        const event = await createEvent({ capacity: 5 });
        jest.spyOn(reminderService, 'createAuto').mockRejectedValueOnce(new Error('сбой'));
        const res = await register(event, user, { tickets: 2 });
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
        await register(a, user, { tickets: 3 });
        await register(b, user, { tickets: 2 });
        await register(a, other, { tickets: 1 });
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

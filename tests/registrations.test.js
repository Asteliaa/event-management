const { useTestDB, createUser, createAdmin, createOrganizer, createEvent, inDays, missingId } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { Event, Registration, Reminder } = require('../src/models');

useTestDB();

const register = (event, user, body = {}) =>
    request(app).post(`/api/v1/events/${event.id}/registrations`).set('Authorization', user.auth).send(body);
const seats = async (event) => (await Event.findByPk(event.id)).seatsTaken;

describe('POST /events/:id/registrations', () => {
    it('201: одна регистрация – одно место, автоматическое напоминание за сутки привязано к регистрации', async () => {
        const user = await createUser();
        const event = await createEvent({ capacity: 10, startsAt: inDays(5) });
        const res = await register(event, user, { comment: 'Буду с ноутбуком' });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 'registered', comment: 'Буду с ноутбуком' });
        expect(res.body.tickets).toBeUndefined();
        expect(res.body.autoReminder).toMatchObject({
            offsetMinutes: 1440, kind: 'auto', status: 'pending', registration: res.body.id
        });
        expect(await seats(event)).toBe(1);
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

    it('409 NO_SEATS, если свободных мест нет', async () => {
        const event = await createEvent({ capacity: 1 });
        await register(event, await createUser());
        const res = await register(event, await createUser());
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('NO_SEATS');
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

    it('422, если передано несколько билетов (поле tickets больше не поддерживается); 401 без токена', async () => {
        const event = await createEvent();
        expect((await register(event, await createUser(), { tickets: 2 })).status).toBe(422);
        expect((await register(event, await createUser(), { tickets: 1 })).status).toBe(201);
        expect((await request(app).post(`/api/v1/events/${event.id}/registrations`)).status).toBe(401);
    });
});

describe('PATCH и DELETE /registrations/:id', () => {
    const setup = async (capacity = 5) => {
        const organizer = await createOrganizer();
        const user = await createUser();
        const event = await createEvent({ capacity, organizerId: organizer.id });
        const reg = (await register(event, user)).body;
        return { organizer, user, event, reg };
    };
    const patch = (reg, who, body) => request(app).patch(`/api/v1/registrations/${reg.id}`).set('Authorization', who.auth).send(body);

    it('участник меняет свой комментарий; чужую регистрацию изменить нельзя (403)', async () => {
        const { user, event, reg } = await setup();
        const res = await patch(reg, user, { comment: 'Приду к началу' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ comment: 'Приду к началу', event: { title: event.title } });
        expect((await patch(reg, await createUser(), { comment: 'x' })).status).toBe(403);
    });

    it('отметку о посещении ставят организатор мероприятия и администратор с момента начала; места не меняются', async () => {
        const { organizer, user, event, reg } = await setup();
        // до начала – нельзя
        expect((await patch(reg, organizer, { attended: true })).body.error.code).toBe('EVENT_NOT_STARTED');
        await Event.update({ startsAt: new Date(Date.now() - 3600e3), endsAt: new Date(Date.now() + 3600e3) }, { where: { id: event.id } });
        expect((await patch(reg, user, { attended: true })).status).toBe(403);
        expect((await patch(reg, await createOrganizer(), { attended: true })).status).toBe(403);
        const marked = await patch(reg, organizer, { attended: true });
        expect(marked.body).toMatchObject({ status: 'registered', attended: true });
        expect(marked.body.attendanceMarkedAt).toBeDefined();
        // исправление отметки администратором
        expect((await patch(reg, await createAdmin(), { attended: false })).body).toMatchObject({ status: 'registered', attended: false });
        expect(await seats(event)).toBe(1);
        // прежний способ (status: attended) больше не принимается
        expect((await patch(reg, organizer, { status: 'attended' })).status).toBe(422);
    });

    it('отмена освобождает место и отменяет ожидающие напоминания; повторная запись создает новую регистрацию', async () => {
        const { user, event, reg } = await setup();
        const res = await request(app).delete(`/api/v1/registrations/${reg.id}`).set('Authorization', user.auth);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'cancelled', cancelledBy: 'user' });
        expect(res.body.cancelledAt).toBeDefined();
        expect(await seats(event)).toBe(0);
        const old = await Reminder.findAll({ where: { registrationId: reg.id } });
        expect(old.map((r) => [r.status, r.cancelReason])).toEqual([['cancelled', 'registration_cancelled']]);

        const again = await register(event, user);
        expect(again.status).toBe(201);
        expect(again.body.id).not.toBe(reg.id);
        expect(again.body.autoReminder.registration).toBe(again.body.id);
        expect(await seats(event)).toBe(1);
        // история: обе регистрации сохранены, активна только новая
        const history = await Registration.findAll({ where: { userId: user.id }, order: [['id', 'ASC']] });
        expect(history.map((r) => r.status)).toEqual(['cancelled', 'registered']);
    });

    it('организатор может отменить регистрацию участника своего мероприятия', async () => {
        const { organizer, event, reg } = await setup();
        const noReason = await request(app).delete(`/api/v1/registrations/${reg.id}`).set('Authorization', organizer.auth);
        expect(noReason.status).toBe(422);
        expect(noReason.body.error.details.map((d) => d.field)).toEqual(['body.reason']);
        const res = await request(app).delete(`/api/v1/registrations/${reg.id}`).set('Authorization', organizer.auth)
            .send({ reason: 'Мероприятие только для сотрудников' });
        expect(res.body).toMatchObject({ status: 'cancelled', cancelledBy: 'organizer', cancelReason: 'Мероприятие только для сотрудников' });
        expect(await seats(event)).toBe(0);
    });

    it('отмененную регистрацию изменить нельзя (409); 404 для отсутствующей', async () => {
        const { user, reg } = await setup();
        await request(app).delete(`/api/v1/registrations/${reg.id}`).set('Authorization', user.auth);
        expect((await patch(reg, user, { comment: 'x' })).status).toBe(409);
        expect((await request(app).delete(`/api/v1/registrations/${missingId}`).set('Authorization', user.auth)).status).toBe(404);
    });
});

describe('Мои регистрации и список участников', () => {
    it('GET /auth/me/registrations – активные по дате мероприятия; status=cancelled – история отмен', async () => {
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
        const history = await request(app).get('/api/v1/auth/me/registrations?status=cancelled').set('Authorization', user.auth);
        expect(history.body.map((r) => r.event.title)).toEqual(['Отменю']);
    });

    it('организатор своего мероприятия и администратор получают участников с email в JSON и CSV', async () => {
        const organizer = await createOrganizer();
        const user = await createUser({ name: 'Анна; Петрова' });
        const event = await createEvent({ organizerId: organizer.id });
        await register(event, user);
        const url = `/api/v1/events/${event.id}/registrations`;

        for (const who of [organizer, await createAdmin()]) {
            const json = await request(app).get(url).set('Authorization', who.auth);
            expect(json.body[0]).toMatchObject({ status: 'registered', user: { name: 'Анна; Петрова', email: user.email } });
        }

        const csv = await request(app).get(`${url}?format=csv`).set('Authorization', organizer.auth);
        expect(csv.headers['content-type']).toMatch('text/csv');
        expect(csv.text).toContain('Имя;Email;Статус');
        expect(csv.text).toContain('"Анна; Петрова"');

        // email не выдается участникам и другим организаторам
        expect((await request(app).get(url).set('Authorization', user.auth)).status).toBe(403);
        expect((await request(app).get(`${url}?format=csv`).set('Authorization', (await createOrganizer()).auth)).status).toBe(403);
    });

    it('список участников включает историю отмен; ?status=active – только активные', async () => {
        const admin = await createAdmin();
        const event = await createEvent();
        const user = await createUser();
        const first = (await register(event, user)).body;
        await request(app).delete(`/api/v1/registrations/${first.id}`).set('Authorization', user.auth);
        await register(event, user);
        const url = `/api/v1/events/${event.id}/registrations`;
        expect((await request(app).get(url).set('Authorization', admin.auth)).body.map((r) => r.status))
            .toEqual(['cancelled', 'registered']);
        expect((await request(app).get(`${url}?status=active`).set('Authorization', admin.auth)).body).toHaveLength(1);
    });
});

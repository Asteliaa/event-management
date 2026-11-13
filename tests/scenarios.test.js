// Завершение функциональных сценариев: правила после начала и завершения мероприятия,
// посещение отдельно от отмены, снятие с публикации, передача мероприятия и снятие роли организатора
const { useTestDB, createUser, createAdmin, createOrganizer, createEvent, registerUser, inDays } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { Event, Registration, Reminder, Notification } = require('../src/models');
const { chatAccess } = require('../src/services/chat.service');

useTestDB();

const api = '/api/v1';
const hours = (h) => new Date(Date.now() + h * 3600e3);
const as = (user) => ({
    get: (url) => request(app).get(api + url).set('Authorization', user.auth),
    post: (url, body = {}) => request(app).post(api + url).set('Authorization', user.auth).send(body),
    patch: (url, body) => request(app).patch(api + url).set('Authorization', user.auth).send(body),
    del: (url, body) => request(app).delete(api + url).set('Authorization', user.auth).send(body)
});

// мероприятие с участником, затем время сдвигается: live – идет, finished – завершено
const started = async (phase = 'live', data = {}) => {
    const organizer = await createOrganizer();
    const user = await createUser();
    const event = await createEvent({
        organizerId: organizer.id, startsAt: inDays(2), endsAt: new Date(inDays(2).getTime() + 2 * 3600e3),
        location: { online: true, url: 'https://meet.example.com/secret' }, ...data
    });
    const { registration } = await registerUser(event, user);
    const times = phase === 'live' ? { startsAt: hours(-1), endsAt: hours(1) } : { startsAt: hours(-3), endsAt: hours(-1) };
    await Event.update(times, { where: { id: event.id } });
    return { organizer, user, event: await Event.findByPk(event.id), registration };
};

describe('Отмена участия и посещение', () => {
    it('после начала участник и организатор не отменяют участие (409 EVENT_STARTED); места не меняются', async () => {
        const { organizer, user, event, registration } = await started();
        const self = await as(user).del(`/registrations/${registration.id}`);
        expect([self.status, self.body.error.code]).toEqual([409, 'EVENT_STARTED']);
        const byOrg = await as(organizer).del(`/registrations/${registration.id}`, { reason: 'Не пришел' });
        expect(byOrg.body.error.code).toBe('EVENT_STARTED');
        expect((await Event.findByPk(event.id)).seatsTaken).toBe(1);
    });

    it('отменить регистрацию на отмененном мероприятии нельзя; посещение не ставится на отмененном и у отмененной регистрации', async () => {
        const organizer = await createOrganizer();
        const user = await createUser();
        const event = await createEvent({ organizerId: organizer.id, startsAt: inDays(2) });
        const { registration } = await registerUser(event, user);
        await as(organizer).post(`/events/${event.id}/cancel`, { reason: 'Болезнь спикера' });
        expect((await as(user).del(`/registrations/${registration.id}`)).body.error.code).toBe('EVENT_CANCELLED');
        await Event.update({ startsAt: hours(-1), endsAt: hours(1) }, { where: { id: event.id } });
        expect((await as(organizer).patch(`/registrations/${registration.id}`, { attended: true })).body.error.code).toBe('EVENT_CANCELLED');

        const other = await createEvent({ organizerId: organizer.id, startsAt: inDays(2) });
        const { registration: r2 } = await registerUser(other, user);
        await as(user).del(`/registrations/${r2.id}`);
        await Event.update({ startsAt: hours(-1), endsAt: hours(1) }, { where: { id: other.id } });
        expect((await as(organizer).patch(`/registrations/${r2.id}`, { attended: true })).body.error.code).toBe('REGISTRATION_CANCELLED');
    });

    it('посещение отмечается после завершения, видно в списке участников, статистике и CSV', async () => {
        const { organizer, user, event, registration } = await started('finished');
        await as(organizer).patch(`/registrations/${registration.id}`, { attended: true });
        const list = await as(organizer).get(`/events/${event.id}/registrations?status=attended`);
        expect(list.body.map((r) => [r.user.id, r.attended])).toEqual([[user.id, true]]);
        expect((await as(organizer).get(`/events/${event.id}/stats`)).body.registrations).toMatchObject({ active: 1, attended: 1 });
        const csv = await as(organizer).get(`/events/${event.id}/registrations?format=csv`);
        expect(csv.text.split('\n')[0]).toContain('Посещение');
        const stored = await Registration.findByPk(registration.id);
        expect(String(stored.attendanceMarkedBy)).toBe(organizer.id);
    });
});

describe('Идущее мероприятие', () => {
    it('начало, часовой пояс, вместимость и формат не меняются; форма целиком с прежними значениями принимается', async () => {
        const { organizer, event } = await started();
        const r1 = await as(organizer).patch(`/events/${event.id}`, { startsAt: hours(0.5).toISOString() });
        expect([r1.status, r1.body.error.code]).toEqual([409, 'EVENT_STARTED']);
        expect(r1.body.error.details.map((d) => d.field)).toEqual(['body.startsAt']);
        expect((await as(organizer).patch(`/events/${event.id}`, { capacity: 500 })).status).toBe(409);
        expect((await as(organizer).patch(`/events/${event.id}`, { timezone: 'Asia/Tokyo' })).status).toBe(409);
        expect((await as(organizer).patch(`/events/${event.id}`, { location: { city: 'Минск' } })).body.error.details
            .map((d) => d.field)).toEqual(['body.location.online']);
        const same = await as(organizer).patch(`/events/${event.id}`, {
            title: 'Новое название', startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString(),
            timezone: event.timezone, capacity: event.capacity, location: { online: true, url: 'https://meet.example.com/secret' }
        });
        expect(same.status).toBe(200);
        expect((await Event.findByPk(event.id)).scheduleVersion).toBe(event.scheduleVersion);
    });

    it('продление окончания – новая версия расписания и уведомление; сократить нельзя', async () => {
        const { organizer, user, event } = await started();
        const shorter = await as(organizer).patch(`/events/${event.id}`, { endsAt: hours(0.5).toISOString() });
        expect(shorter.status).toBe(422);
        const res = await as(organizer).patch(`/events/${event.id}`, { endsAt: hours(2).toISOString() });
        expect(res.status).toBe(200);
        expect(res.body.phase).toBe('live');
        expect((await Event.findByPk(event.id)).scheduleVersion).toBe(event.scheduleVersion + 1);
        const notes = await Notification.findAll({ where: { userId: user.id, type: 'event_rescheduled' } });
        expect(notes.map((n) => n.payload.kind)).toEqual(['extended']);
    });

    it('исправление ссылки идущего мероприятия – с уведомлением участников', async () => {
        const { organizer, user, event } = await started();
        const res = await as(organizer).patch(`/events/${event.id}`, { location: { online: true, url: 'https://meet.example.com/new' } });
        expect(res.status).toBe(200);
        const notes = await Notification.findAll({ where: { userId: user.id, type: 'event_location_changed' } });
        expect(notes.map((n) => n.payload.urlChanged)).toEqual([true]);
        expect(JSON.stringify(notes[0].payload)).not.toContain('meet.example.com');
    });

    it('отмена идущего – только с причиной; посещение сохраняется, напоминания отменены, регистрация закрыта', async () => {
        const { organizer, user, event, registration } = await started();
        await as(organizer).patch(`/registrations/${registration.id}`, { attended: true });
        await Reminder.update({ status: 'pending' }, { where: { registrationId: registration.id } });
        expect((await as(organizer).post(`/events/${event.id}/cancel`)).status).toBe(422);
        const res = await as(organizer).post(`/events/${event.id}/cancel`, { reason: 'Технический сбой' });
        expect(res.body).toMatchObject({ status: 'cancelled', cancelReason: 'Технический сбой' });
        expect(await Registration.findByPk(registration.id)).toMatchObject({ status: 'registered', attended: true });
        expect(await Reminder.count({ where: { registrationId: registration.id, status: 'pending' } })).toBe(0);
        const again = await as(await createUser()).post(`/events/${event.id}/registrations`);
        expect(again.body.error.code).toBe('EVENT_CANCELLED');
        expect((await Notification.findAll({ where: { userId: user.id, type: 'event_cancelled' } })).length).toBe(1);
    });

    it('снять с публикации после начала нельзя (409 EVENT_STARTED)', async () => {
        const { organizer, event } = await started();
        const res = await as(organizer).post(`/events/${event.id}/unpublish`);
        expect([res.status, res.body.error.code]).toEqual([409, 'EVENT_STARTED']);
    });
});

describe('Завершенное мероприятие', () => {
    it('меняется только описание; даты, место, формат и вместимость – 409 EVENT_FINISHED', async () => {
        const { organizer, event } = await started('finished');
        for (const body of [{ endsAt: hours(1).toISOString() }, { capacity: 50 }, { location: { city: 'Минск' } }, { title: 'Другое' }]) {
            const res = await as(organizer).patch(`/events/${event.id}`, body);
            expect([res.status, res.body.error.code]).toEqual([409, 'EVENT_FINISHED']);
        }
        const ok = await as(organizer).patch(`/events/${event.id}`, { description: 'Запись и материалы доклада' });
        expect(ok.body.description).toBe('Запись и материалы доклада');
        expect((await as(organizer).post(`/events/${event.id}/cancel`, { reason: 'x' })).body.error.code).toBe('EVENT_FINISHED');
    });

    it('ссылка подключения скрыта от участников (видна организатору); чат только для чтения', async () => {
        const { organizer, user, event } = await started('finished');
        expect((await as(user).get(`/events/${event.id}`)).body.location.url).toBeUndefined();
        const mine = await as(user).get('/auth/me/registrations');
        expect(mine.body[0].event.location.url).toBeUndefined();
        expect((await as(organizer).get(`/events/${event.id}`)).body.location.url).toBe('https://meet.example.com/secret');
        expect(await chatAccess(user, event.id)).toMatchObject({ allowed: true, canWrite: false });
        expect(await chatAccess(organizer, event.id)).toMatchObject({ allowed: true, canWrite: false });
    });

    it('у идущего ссылка видна участнику и чат открыт для записи', async () => {
        const { user, event } = await started('live');
        expect((await as(user).get(`/events/${event.id}`)).body.location.url).toBe('https://meet.example.com/secret');
        expect(await chatAccess(user, event.id)).toMatchObject({ allowed: true, canWrite: true });
    });
});

describe('Снятие с публикации и повторная публикация', () => {
    it('нельзя, если регистрации были (даже отмененные); повторная публикация проверяет срок регистрации', async () => {
        const organizer = await createOrganizer();
        const user = await createUser();
        const event = await createEvent({ organizerId: organizer.id, startsAt: inDays(3) });
        const { registration } = await registerUser(event, user);
        await as(user).del(`/registrations/${registration.id}`);
        expect((await as(organizer).post(`/events/${event.id}/unpublish`)).body.error.code).toBe('EVENT_HAS_REGISTRATIONS');

        const clean = await createEvent({ organizerId: organizer.id, startsAt: inDays(3), registrationDeadline: inDays(1) });
        expect((await as(organizer).post(`/events/${clean.id}/unpublish`)).body.status).toBe('draft');
        await Event.update({ registrationDeadline: hours(-1) }, { where: { id: clean.id } });
        const fail = await as(organizer).post(`/events/${clean.id}/publish`);
        expect(fail.status).toBe(422);
        expect(fail.body.error.details.map((d) => d.field)).toEqual(['body.registrationDeadline']);
        await as(organizer).patch(`/events/${clean.id}`, { registrationDeadline: inDays(2).toISOString() });
        expect((await as(organizer).post(`/events/${clean.id}/publish`)).body.status).toBe('published');
    });
});

describe('Передача мероприятия и роль организатора', () => {
    it('роль организатора не снимается при опубликованных незавершенных мероприятиях, в том числе идущих', async () => {
        const admin = await createAdmin();
        const { organizer, event } = await started('live');
        const res = await as(admin).patch(`/admin/users/${organizer.id}`, { role: 'user' });
        expect([res.status, res.body.error.code]).toEqual([409, 'ORGANIZER_HAS_ACTIVE_EVENTS']);

        // передача другому организатору – после нее роль снимается
        const other = await createOrganizer();
        const moved = await as(admin).patch(`/events/${event.id}`, { organizer: other.id });
        expect(moved.body.organizer.id).toBe(other.id);
        const ok = await as(admin).patch(`/admin/users/${organizer.id}`, { role: 'user' });
        expect(ok.body.role).toBe('user');
        // организатор не может передать мероприятие сам
        expect((await as(other).patch(`/events/${event.id}`, { organizer: admin.id })).status).toBe(403);
    });

    it('завершенные, отмененные и черновики не мешают снять роль; передать можно и завершенное', async () => {
        const admin = await createAdmin();
        const { organizer, event } = await started('finished');
        await createEvent({ organizerId: organizer.id, status: 'draft', startsAt: inDays(5) });
        await createEvent({ organizerId: organizer.id, status: 'cancelled', startsAt: inDays(5) });
        expect((await as(admin).patch(`/events/${event.id}`, { organizer: admin.id })).status).toBe(200);
        expect((await as(admin).patch(`/admin/users/${organizer.id}`, { role: 'user' })).status).toBe(200);
    });
});

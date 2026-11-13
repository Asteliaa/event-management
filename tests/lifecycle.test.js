// Этап Б2: состояния мероприятия, перенос и отмена, уведомления и надежные напоминания
const { useTestDB, createUser, createAdmin, createOrganizer, createEvent, registerUser, inDays } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { sequelize, Event, Registration, Reminder, Notification } = require('../src/models');
const scheduler = require('../src/jobs/reminderScheduler');
const notify = require('../src/socket/notify');

useTestDB();

const api = '/api/v1/events';
const hours = (h) => new Date(Date.now() + h * 3600e3);
const as = (user) => ({
    get: (url) => request(app).get(url).set('Authorization', user.auth),
    post: (url, body = {}) => request(app).post(url).set('Authorization', user.auth).send(body),
    patch: (url, body) => request(app).patch(url).set('Authorization', user.auth).send(body),
    del: (url) => request(app).delete(url).set('Authorization', user.auth)
});

describe('Черновик и публикация', () => {
    it('черновик может быть неполным; публикация требует начало, окончание и данные формата', async () => {
        const org = await createOrganizer();
        const draft = await as(org).post(api, { title: 'Черновик без дат', type: 'webinar', timezone: 'Europe/Minsk' });
        expect(draft.status).toBe(201);
        expect(draft.body).toMatchObject({ status: 'draft', registrationAvailable: false });
        expect(draft.body.startsAt).toBeUndefined();

        const fail = await as(org).post(`${api}/${draft.body.id}/publish`);
        expect(fail.status).toBe(422);
        expect(fail.body.error.details.map((d) => d.field)).toEqual(['body.startsAt', 'body.endsAt', 'body.location.city']);

        await as(org).patch(`${api}/${draft.body.id}`, {
            startsAt: inDays(3).toISOString(), endsAt: new Date(inDays(3).getTime() + 3600e3).toISOString(),
            location: { online: true }
        });
        const noUrl = await as(org).post(`${api}/${draft.body.id}/publish`);
        expect(noUrl.body.error.details.map((d) => d.field)).toEqual(['body.location.url']);

        await as(org).patch(`${api}/${draft.body.id}`, { location: { online: true, url: 'https://meet.example.com/x' } });
        const ok = await as(org).post(`${api}/${draft.body.id}/publish`);
        expect(ok.status).toBe(200);
        expect(ok.body).toMatchObject({ status: 'published', registrationAvailable: true, phase: 'upcoming' });
        expect(ok.body.publishedAt).toBeDefined();
        expect((await as(org).post(`${api}/${draft.body.id}/publish`)).body.error.code).toBe('EVENT_NOT_DRAFT');
    });

    it('черновик не виден в каталоге и посторонним (404), но виден владельцу и администратору', async () => {
        const org = await createOrganizer();
        const draft = await createEvent({ status: 'draft', organizerId: org.id, title: 'Секретный черновик' });
        await createEvent({ title: 'Опубликованное' });
        await createEvent({ title: 'Отмененное', status: 'cancelled' });

        const catalog = await request(app).get(`${api}?when=all`);
        expect(catalog.body.data.map((e) => e.title)).toEqual(['Опубликованное']);
        expect((await request(app).get(`${api}/${draft.id}`)).status).toBe(404);
        expect((await as(await createUser()).get(`${api}/${draft.id}`)).status).toBe(404);
        expect((await request(app).get(`${api}/${draft.id}/calendar.ics`)).status).toBe(404);
        expect((await as(org).get(`${api}/${draft.id}`)).body).toMatchObject({ status: 'draft', canManage: true });
        expect((await as(await createAdmin()).get(`${api}/${draft.id}`)).status).toBe(200);
        expect((await as(await createUser()).post(`${api}/${draft.id}/registrations`)).status).toBe(404);
    });

    it('отмененное мероприятие доступно по ссылке и в профиле участника', async () => {
        const user = await createUser();
        const event = await createEvent({ title: 'Будет отменено' });
        await registerUser(event, user);
        await as(await createAdmin()).post(`${api}/${event.id}/cancel`, { reason: 'Болезнь докладчика' });
        expect((await request(app).get(`${api}/${event.id}`)).body).toMatchObject({ status: 'cancelled', cancelReason: 'Болезнь докладчика' });
        const mine = await as(user).get('/api/v1/auth/me/registrations');
        expect(mine.body.map((r) => [r.event.title, r.event.status])).toEqual([['Будет отменено', 'cancelled']]);
    });

    it('снять с публикации можно только без регистраций', async () => {
        const org = await createOrganizer();
        const event = await createEvent({ organizerId: org.id });
        expect((await as(org).post(`${api}/${event.id}/unpublish`)).body.status).toBe('draft');
        await as(org).post(`${api}/${event.id}/publish`);
        await registerUser(event, await createUser());
        expect((await as(org).post(`${api}/${event.id}/unpublish`)).body.error.code).toBe('EVENT_HAS_REGISTRATIONS');
    });

    it('действия с состоянием – только владелец или администратор', async () => {
        const event = await createEvent({ organizerId: (await createOrganizer()).id });
        expect((await as(await createOrganizer()).post(`${api}/${event.id}/cancel`)).status).toBe(403);
        expect((await as(await createUser()).post(`${api}/${event.id}/unpublish`)).status).toBe(403);
    });
});

describe('Доступность регистрации', () => {
    it('переключатель записи и срок регистрации не зависят от публикации', async () => {
        const org = await createOrganizer();
        const event = await createEvent({ organizerId: org.id });
        await as(org).patch(`${api}/${event.id}`, { registrationOpen: false });
        const closed = await as(await createUser()).post(`${api}/${event.id}/registrations`);
        expect(closed.body.error.code).toBe('REGISTRATION_CLOSED');

        await as(org).patch(`${api}/${event.id}`, { registrationOpen: true, registrationDeadline: hours(-1).toISOString() });
        const late = await as(await createUser()).post(`${api}/${event.id}/registrations`);
        expect(late.body.error.code).toBe('REGISTRATION_DEADLINE_PASSED');
        expect((await request(app).get(`${api}/${event.id}`)).body).toMatchObject({ status: 'published', registrationAvailable: false });
    });

    it('срок регистрации не может быть позже начала', async () => {
        const org = await createOrganizer();
        const event = await createEvent({ organizerId: org.id, startsAt: inDays(2) });
        const res = await as(org).patch(`${api}/${event.id}`, { registrationDeadline: inDays(3).toISOString() });
        expect(res.status).toBe(422);
        expect(res.body.error.details[0].field).toBe('body.registrationDeadline');
    });

    it('временная фаза вычисляется: идет сейчас, завершено', async () => {
        const live = await createEvent({ startsAt: hours(-1), endsAt: hours(1) });
        const done = await createEvent({ startsAt: hours(-3), endsAt: hours(-1) });
        expect((await request(app).get(`${api}/${live.id}`)).body.phase).toBe('live');
        expect((await request(app).get(`${api}/${done.id}`)).body.phase).toBe('finished');
    });
});

describe('Перенос: версия расписания, напоминания и уведомления', () => {
    afterEach(() => notify.setIO(null));

    it('перенос увеличивает schedule_version, пересчитывает напоминания и уведомляет только активных участников', async () => {
        const org = await createOrganizer();
        const event = await createEvent({ organizerId: org.id, startsAt: inDays(10) });
        const [anna, ivan] = [await createUser(), await createUser()];
        await registerUser(event, anna);
        const { registration: ivanReg } = await registerUser(event, ivan);
        await as(ivan).del(`/api/v1/registrations/${ivanReg.id}`);

        const emitted = [];
        notify.setIO({ to: (rooms) => ({ emit: (name, payload) => emitted.push({ rooms, name, payload }) }), emit: () => {} });
        const newStart = inDays(12);
        const res = await as(org).patch(`${api}/${event.id}`, {
            startsAt: newStart.toISOString(), endsAt: new Date(newStart.getTime() + 3600e3).toISOString()
        });
        expect(res.body.scheduleVersion).toBe(2);
        const reminder = await Reminder.findOne({ where: { userId: anna.id, eventId: event.id } });
        expect(reminder).toMatchObject({ scheduleVersion: 2, status: 'pending' });
        expect(reminder.remindAt.getTime()).toBe(newStart.getTime() - 864e5);

        const notes = await Notification.findAll();
        expect(notes.map((n) => [String(n.userId), n.type, n.dedupKey]))
            .toEqual([[anna.id, 'event_rescheduled', `event:${event.id}:rescheduled:v2`]]);
        expect(notes[0].payload).toMatchObject({ scheduleVersion: 2, timezone: 'Europe/Minsk' });
        expect(emitted).toEqual([expect.objectContaining({ rooms: [`user:${anna.id}`], name: 'notification:new' })]);
    });

    it('смена места или описания не меняет версию и не трогает напоминания; о месте – уведомление без ссылки', async () => {
        const org = await createOrganizer();
        const event = await createEvent({ organizerId: org.id, startsAt: inDays(5), location: { online: true, url: 'https://meet.example.com/old' } });
        const user = await createUser();
        await registerUser(event, user);
        const before = await Reminder.findOne({ where: { userId: user.id } });

        await as(org).patch(`${api}/${event.id}`, { description: 'Новое описание' });
        expect(await Notification.count()).toBe(0);
        const res = await as(org).patch(`${api}/${event.id}`, { location: { online: true, url: 'https://meet.example.com/new-secret' } });
        expect(res.body.scheduleVersion).toBe(1);
        const after = await Reminder.findByPk(before.id);
        expect([after.status, after.scheduleVersion, after.remindAt.getTime()]).toEqual(['pending', 1, before.remindAt.getTime()]);
        const [note] = await Notification.findAll();
        expect(note).toMatchObject({ type: 'event_location_changed' });
        expect(note.payload).toMatchObject({ online: true, urlChanged: true });
        expect(JSON.stringify(note.payload)).not.toContain('new-secret');
    });

    it('напоминание, уже отправленное по старому расписанию, после переноса отправляется снова; прошедшее – skipped', async () => {
        const org = await createOrganizer();
        const event = await createEvent({ organizerId: org.id, startsAt: hours(0.5), endsAt: hours(2) });
        const user = await createUser();
        const { registration } = await registerUser(event, user);
        await Reminder.bulkCreate([
            { userId: user.id, eventId: event.id, registrationId: registration.id, offsetMinutes: 20, remindAt: hours(0.5 - 20 / 60) },
            { userId: user.id, eventId: event.id, registrationId: registration.id, offsetMinutes: 10, remindAt: hours(0.5 - 10 / 60) }
        ]);
        expect(await scheduler.runOnce(hours(0.5 - 15 / 60))).toBe(1);   // отправлено «за 20 минут»

        // перенос на 2 дня вперед: оба напоминания снова в будущем
        await as(org).patch(`${api}/${event.id}`, { startsAt: inDays(2).toISOString(), endsAt: new Date(inDays(2).getTime() + 3600e3).toISOString() });
        const all = await Reminder.findAll({ where: { registrationId: registration.id }, order: [['offsetMinutes', 'DESC']] });
        expect(all.map((r) => [r.offsetMinutes, r.status, r.scheduleVersion])).toEqual([[20, 'pending', 2], [10, 'pending', 2]]);
        expect(await scheduler.runOnce(new Date(inDays(2).getTime() - 15 * 60e3))).toBe(1);
        const keys = (await Notification.findAll({ where: { type: 'reminder' }, order: [['id', 'ASC']] })).map((n) => n.dedupKey);
        expect(keys).toEqual([`reminder:${all[0].id}:v1`, `reminder:${all[0].id}:v2`]);

        // перенос на ближайшие минуты: время напоминания за 10 минут уже прошло – skipped
        await as(org).patch(`${api}/${event.id}`, { startsAt: hours(0.1).toISOString(), endsAt: hours(1).toISOString() });
        const skipped = await Reminder.findOne({ where: { registrationId: registration.id, offsetMinutes: 10 } });
        expect([skipped.status, skipped.scheduleVersion]).toEqual(['skipped', 3]);
    });

    it('напоминание устаревшей версии расписания не отправляется', async () => {
        const event = await createEvent({ startsAt: hours(0.5), endsAt: hours(2) });
        const user = await createUser();
        const { registration } = await registerUser(event, user);
        await Reminder.create({ userId: user.id, eventId: event.id, registrationId: registration.id, offsetMinutes: 20, remindAt: hours(0.2) });
        await Event.update({ scheduleVersion: 2 }, { where: { id: event.id } });
        expect(await scheduler.runOnce(hours(0.3))).toBe(0);
    });

    it('у завершенного мероприятия расписание не меняется, отмененное не изменяется вовсе', async () => {
        const admin = await createAdmin();
        const done = await createEvent({ startsAt: hours(-3), endsAt: hours(-1) });
        const res = await as(admin).patch(`${api}/${done.id}`, { startsAt: inDays(1).toISOString(), endsAt: inDays(2).toISOString() });
        expect(res.body.error.code).toBe('EVENT_FINISHED');
        const cancelled = await createEvent({ status: 'cancelled' });
        expect((await as(admin).patch(`${api}/${cancelled.id}`, { title: 'Новое' })).body.error.code).toBe('EVENT_CANCELLED');
    });
});

describe('Отмена мероприятия и регистрации', () => {
    afterEach(() => notify.setIO(null));

    it('отмена мероприятия: регистрации сохраняются, напоминания отменяются, участники уведомлены один раз', async () => {
        const org = await createOrganizer();
        const event = await createEvent({ organizerId: org.id, capacity: 10 });
        const users = [await createUser(), await createUser()];
        for (const u of users) await registerUser(event, u);

        const res = await as(org).post(`${api}/${event.id}/cancel`, { reason: 'Площадка недоступна' });
        expect(res.body).toMatchObject({ status: 'cancelled', cancelReason: 'Площадка недоступна', seatsTaken: 2 });
        expect(await Registration.count({ where: { eventId: event.id, status: 'registered' } })).toBe(2);
        expect(await Reminder.count({ where: { eventId: event.id, status: 'pending' } })).toBe(0);
        expect((await Reminder.findAll()).every((r) => r.cancelReason === 'event_cancelled')).toBe(true);
        expect(await Notification.count({ where: { type: 'event_cancelled' } })).toBe(2);

        expect((await as(org).post(`${api}/${event.id}/cancel`)).body.error.code).toBe('EVENT_CANCELLED');
        expect(await Notification.count({ where: { type: 'event_cancelled' } })).toBe(2);
        expect(await scheduler.runOnce(inDays(30))).toBe(0);
    });

    it('черновик и завершенное мероприятие не отменяются', async () => {
        const admin = await createAdmin();
        expect((await as(admin).post(`${api}/${(await createEvent({ status: 'draft' })).id}/cancel`)).body.error.code).toBe('EVENT_NOT_PUBLISHED');
        const done = await createEvent({ startsAt: hours(-3), endsAt: hours(-1) });
        expect((await as(admin).post(`${api}/${done.id}/cancel`)).body.error.code).toBe('EVENT_FINISHED');
    });

    it('отмена участия организатором уведомляет участника; собственная отмена – без уведомления', async () => {
        const org = await createOrganizer();
        const event = await createEvent({ organizerId: org.id });
        const [a, b] = [await createUser(), await createUser()];
        const { registration: ra } = await registerUser(event, a);
        const { registration: rb } = await registerUser(event, b);
        await as(org).del(`/api/v1/registrations/${ra.id}`);
        await as(b).del(`/api/v1/registrations/${rb.id}`);
        const notes = await Notification.findAll();
        expect(notes.map((n) => [String(n.userId), n.type, n.payload.by])).toEqual([[a.id, 'registration_cancelled', 'organizer']]);
    });

    it('планировщик пропускает напоминание, пока регистрация заблокирована отменой, и не отправляет его после отмены', async () => {
        const event = await createEvent({ startsAt: hours(0.5), endsAt: hours(2) });
        const user = await createUser();
        const { registration } = await registerUser(event, user);
        await Reminder.create({ userId: user.id, eventId: event.id, registrationId: registration.id, offsetMinutes: 20, remindAt: hours(0.2) });

        // транзакция отмены держит строку регистрации (FOR UPDATE) – планировщик ее пропускает, а не ждет
        const t = await sequelize.transaction();
        await Registration.findByPk(registration.id, { transaction: t, lock: t.LOCK.UPDATE });
        expect(await scheduler.runOnce(hours(0.3))).toBe(0);
        await Registration.update({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'user' }, { where: { id: registration.id }, transaction: t });
        await t.commit();
        expect(await scheduler.runOnce(hours(0.3))).toBe(0);
        expect(await Notification.count()).toBe(0);
    });

    it('повторная запись после отмены получает свои напоминания и ключи, история старой регистрации не мешает', async () => {
        const event = await createEvent({ startsAt: inDays(3) });
        const user = await createUser();
        const first = await registerUser(event, user);
        await as(user).del(`/api/v1/registrations/${first.registration.id}`);
        const second = await registerUser(event, user);
        expect(second.reminder.registrationId).toBe(second.registration.id);
        expect(await Reminder.count({ where: { userId: user.id, status: 'pending' } })).toBe(1);
        expect(await scheduler.runOnce(new Date(inDays(3).getTime() - 23 * 3600e3))).toBe(1);
        const [note] = await Notification.findAll();
        expect(note.dedupKey).toBe(`reminder:${second.reminder.id}:v1`);
    });
});

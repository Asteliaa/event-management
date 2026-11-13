// Этап Б3: блокировка, деактивация и удаление аккаунта – три разных действия;
// видимость онлайн-ссылки во всех API
const { QueryTypes } = require('sequelize');
const { useTestDB, createUser, createAdmin, createOrganizer, registerUser, createEvent, inDays } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const scheduler = require('../src/jobs/reminderScheduler');
const { sequelize, User, Event, Registration, Reminder, Notification, Message, Favorite } = require('../src/models');

useTestDB();

const api = '/api/v1';
const login = (user, password = 'secret123') => request(app).post(`${api}/auth/login`).send({ email: user.email, password });
const me = (auth) => request(app).get(`${api}/auth/me`).set('Authorization', auth);

describe('Деактивация', () => {
    it('сам пользователь: нужен пароль; токены отзываются; данные и регистрации сохраняются; вход возвращает аккаунт', async () => {
        const user = await createUser();
        const event = await createEvent({ capacity: 5 });
        await registerUser(event, user);

        const bad = await request(app).post(`${api}/auth/me/deactivate`).set('Authorization', user.auth).send({ password: 'wrong' });
        expect(bad.status).toBe(400);
        const ok = await request(app).post(`${api}/auth/me/deactivate`).set('Authorization', user.auth).send({ password: 'secret123' });
        expect(ok.status).toBe(204);
        expect((await me(user.auth)).status).toBe(401);
        const stored = await User.findByPk(user.id);
        expect(stored).toMatchObject({ status: 'deactivated', deactivatedBy: 'user', email: user.email, name: user.name });
        expect(await Registration.count({ where: { userId: user.id, status: 'registered' } })).toBe(1);
        expect((await Event.findByPk(event.id)).seatsTaken).toBe(1);

        const back = await login(user);
        expect(back.status).toBe(200);
        expect(back.body.user.status).toBe('active');
        expect(back.body.reactivated).toBe(true);
        expect((await me(`Bearer ${back.body.token}`)).status).toBe(200);
        // обычный вход – без признака восстановления
        expect((await login(user)).body.reactivated).toBeUndefined();
    });

    it('администратором: вход не возвращает аккаунт, вернуть может только администратор', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const res = await request(app).post(`${api}/admin/users/${user.id}/deactivate`).set('Authorization', admin.auth);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'deactivated', deactivatedBy: 'admin' });
        const denied = await login(user);
        expect(denied.status).toBe(403);
        expect(denied.body.error.code).toBe('ACCOUNT_DEACTIVATED');
        expect((await request(app).post(`${api}/admin/users/${admin.id}/deactivate`).set('Authorization', admin.auth)).status).toBe(400);

        const back = await request(app).post(`${api}/admin/users/${user.id}/reactivate`).set('Authorization', admin.auth);
        expect(back.body.status).toBe('active');
        expect((await login(user)).status).toBe(200);
    });

    it('напоминания деактивированному не отправляются; после восстановления актуальное приходит один раз, после начала – нет', async () => {
        const user = await createUser();
        const active = await createUser();
        const event = await createEvent({ startsAt: new Date(Date.now() + 30 * 60e3) });
        await registerUser(event, user);
        await registerUser(event, active);
        for (const u of [user, active]) {
            await request(app).post(`${api}/reminders`).set('Authorization', u.auth).send({ event: event.id, offsetMinutes: 25 });
            await request(app).post(`${api}/reminders`).set('Authorization', u.auth).send({ event: event.id, offsetMinutes: 5 });
        }
        await request(app).post(`${api}/auth/me/deactivate`).set('Authorization', user.auth).send({ password: 'secret123' });

        // за 25 минут: активному – отправлено, деактивированному – нет, но задание сохранено
        await scheduler.runOnce(new Date(Date.now() + 6 * 60e3));
        expect(await Notification.count({ where: { userId: active.id, type: 'reminder' } })).toBe(1);
        expect(await Notification.count({ where: { userId: user.id } })).toBe(0);
        expect((await Reminder.findOne({ where: { userId: user.id, offsetMinutes: 25 } })).status).toBe('pending');

        // восстановление входом: задержанное напоминание приходит один раз, повторный проход не дублирует
        // повторный вход и повторные проходы обработчика не создают дублей
        const back = await login(user);
        await login(user);
        await scheduler.runOnce(new Date(Date.now() + 22 * 60e3));
        await scheduler.runOnce(new Date(Date.now() + 22 * 60e3));
        await login(user);
        await scheduler.runOnce(new Date(Date.now() + 23 * 60e3));
        const notes = await Notification.findAll({ where: { userId: user.id, type: 'reminder' } });
        expect(notes.map((n) => [n.payload.offsetMinutes, Boolean(n.payload.delayed)])).toEqual([[25, true]]);
        // в отложенном уведомлении – актуальное начало и исходное время напоминания
        const reminder25 = await Reminder.findOne({ where: { userId: user.id, offsetMinutes: 25 } });
        expect(new Date(notes[0].payload.startsAt).getTime()).toBe(event.startsAt.getTime());
        expect(new Date(notes[0].payload.remindAt).getTime()).toBe(reminder25.remindAt.getTime());

        // за 5 минут – снова деактивирован; к началу мероприятия напоминание пропускается
        await request(app).post(`${api}/auth/me/deactivate`).set('Authorization', `Bearer ${back.body.token}`).send({ password: 'secret123' });
        await scheduler.runOnce(new Date(Date.now() + 31 * 60e3));
        await login(user);
        await scheduler.runOnce(new Date(Date.now() + 32 * 60e3));
        const late = await Reminder.findOne({ where: { userId: user.id, offsetMinutes: 5 } });
        expect([late.status, late.cancelReason]).toEqual(['skipped', 'event_started']);
        expect(await Notification.count({ where: { userId: user.id, type: 'reminder' } })).toBe(1);
    });

    it('после восстановления не доставляются напоминания отмененной регистрации, отмененного мероприятия и устаревшей версии', async () => {
        const organizer = await createOrganizer();
        const user = await createUser();
        const start = new Date(Date.now() + 2 * 3600e3);
        const [e1, e2, e3] = await Promise.all([1, 2, 3].map(() => createEvent({ organizerId: organizer.id, startsAt: start })));
        const regs = [];
        for (const e of [e1, e2, e3]) regs.push((await registerUser(e, user)).registration);
        for (const e of [e1, e2, e3]) {
            await request(app).post(`${api}/reminders`).set('Authorization', user.auth).send({ event: e.id, offsetMinutes: 110 });
        }
        await request(app).post(`${api}/auth/me/deactivate`).set('Authorization', user.auth).send({ password: 'secret123' });
        await scheduler.runOnce(new Date(Date.now() + 20 * 60e3));
        // пока аккаунт деактивирован: регистрация 1 отменена организатором, мероприятие 2 отменено,
        // у мероприятия 3 напоминание осталось от прежней версии расписания
        await request(app).delete(`${api}/registrations/${regs[0].id}`).set('Authorization', organizer.auth).send({ reason: 'Перенос в другую группу' });
        await request(app).post(`${api}/events/${e2.id}/cancel`).set('Authorization', organizer.auth).send({ reason: 'Болезнь спикера' });
        await Event.update({ scheduleVersion: 5 }, { where: { id: e3.id } });
        await login(user);
        await scheduler.runOnce(new Date(Date.now() + 25 * 60e3));
        expect(await Notification.count({ where: { userId: user.id, type: 'reminder' } })).toBe(0);
    });

    it('напоминания заблокированному пользователю пропускаются', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const event = await createEvent({ startsAt: new Date(Date.now() + 30 * 60e3) });
        await registerUser(event, user);
        await request(app).post(`${api}/reminders`).set('Authorization', user.auth).send({ event: event.id, offsetMinutes: 20 });
        await request(app).patch(`${api}/admin/users/${user.id}`).set('Authorization', admin.auth).send({ blocked: true });
        await scheduler.runOnce(new Date(Date.now() + 15 * 60e3));
        const skipped = await Reminder.findOne({ where: { userId: user.id, offsetMinutes: 20 } });
        expect([skipped.status, skipped.cancelReason]).toEqual(['skipped', 'user_inactive']);
    });

    it('напоминание после начала мероприятия не отправляется', async () => {
        const user = await createUser();
        const event = await createEvent({ startsAt: new Date(Date.now() + 30 * 60e3) });
        await registerUser(event, user);
        await request(app).post(`${api}/reminders`).set('Authorization', user.auth).send({ event: event.id, offsetMinutes: 20 });
        await scheduler.runOnce(new Date(Date.now() + 40 * 60e3));
        expect(await Notification.count()).toBe(0);
        const reminder = await Reminder.findOne({ where: { offsetMinutes: 20 } });
        expect([reminder.status, reminder.cancelReason]).toEqual(['skipped', 'event_started']);
    });
});

describe('Удаление аккаунта (обезличивание)', () => {
    const seedHistory = async (user) => {
        const organizer = await createOrganizer();
        const future = await createEvent({ organizerId: organizer.id, capacity: 5, title: 'Будущее' });
        const past = await createEvent({ organizerId: organizer.id, title: 'Прошедшее', startsAt: inDays(-10) });
        const { registration: futureReg } = await registerUser(future, user);
        await futureReg.update({ comment: 'Мой телефон +375 29 000-00-00' });
        await Registration.create({ eventId: past.id, userId: user.id, comment: 'Буду с коллегой' });
        await request(app).post(`${api}/reminders`).set('Authorization', user.auth).send({ event: future.id, offsetMinutes: 60 });
        await request(app).put(`${api}/auth/me/favorites/${future.id}`).set('Authorization', user.auth);
        await Notification.create({ userId: user.id, type: 'event_cancelled', eventId: past.id, payload: {}, dedupKey: 'x' });
        await Message.create({ eventId: past.id, userId: user.id, author: user.name, text: 'Пишите мне на почту' });
        return { organizer, future, past, futureReg };
    };

    it('сам пользователь с паролем: перечисленные данные очищаются, история остается', async () => {
        const user = await createUser({ name: 'Анна Петрова', city: 'Минск' });
        const draft = await createEvent({ organizerId: user.id, status: 'draft' });
        const { future, past } = await seedHistory(user);

        expect((await request(app).delete(`${api}/auth/me`).set('Authorization', user.auth).send({ password: 'wrong' })).status).toBe(400);
        const res = await request(app).delete(`${api}/auth/me`).set('Authorization', user.auth).send({ password: 'secret123' });
        expect(res.status).toBe(204);

        const stored = await User.scope('withPassword').findByPk(user.id);
        expect(stored).toMatchObject({ name: User.DELETED_NAME, email: null, city: null, role: 'user', status: 'deleted', blocked: false });
        expect(stored.deletedAt).toBeTruthy();
        expect(stored.tokenVersion).toBe(user.tokenVersion + 1);
        // токен и вход недействительны, email освобожден
        expect((await me(user.auth)).status).toBe(401);
        expect((await login(user)).status).toBe(401);
        expect((await request(app).post(`${api}/auth/register`).send({ name: 'Новая Анна', email: user.email, password: 'secret123' })).status).toBe(201);

        // будущая регистрация отменена системой, место освобождено; прошедшая осталась
        const regs = await Registration.findAll({ where: { userId: user.id }, order: [['id', 'ASC']] });
        expect(regs.map((r) => [r.eventId, r.status, r.cancelledBy, r.comment])).toEqual([
            [future.id, 'cancelled', 'system', ''],
            [past.id, 'registered', null, '']
        ]);
        expect((await Event.findByPk(future.id)).seatsTaken).toBe(0);
        expect(await Reminder.count({ where: { userId: user.id, status: 'pending' } })).toBe(0);
        expect(await Notification.count({ where: { userId: user.id } })).toBe(0);
        expect(await Favorite.count({ where: { userId: user.id } })).toBe(0);
        const [msg] = await Message.findAll({ where: { userId: user.id } });
        expect(msg.toJSON()).toMatchObject({ author: User.DELETED_NAME, text: 'Сообщение удалено', deleted: true });
        expect(await Event.count({ where: { id: draft.id } })).toBe(0);

        // ни в одной строке БД не осталось прежнего имени, email и текста комментария
        const leftovers = await sequelize.query(
            `SELECT 'users' AS t FROM users WHERE id = :id AND (name = :name OR email = :email)
             UNION ALL SELECT 'registrations' FROM registrations WHERE user_id = :id AND comment <> ''
             UNION ALL SELECT 'messages' FROM messages WHERE user_id = :id AND (author = :name OR text LIKE '%почту%')`,
            { replacements: { id: user.id, name: 'Анна Петрова', email: user.email }, type: QueryTypes.SELECT }
        );
        expect(leftovers).toEqual([]);
    });

    it('удаленный не попадает в список пользователей и в статистику; список участников показывает обезличенную запись', async () => {
        const admin = await createAdmin();
        const user = await createUser({ name: 'Иван' });
        const { organizer, past } = await seedHistory(user);
        expect((await request(app).delete(`${api}/admin/users/${user.id}`).set('Authorization', admin.auth)).status).toBe(204);
        const list = await request(app).get(`${api}/admin/users`).set('Authorization', admin.auth);
        expect(list.body.data.map((u) => u.id)).not.toContain(user.id);
        const deleted = await request(app).get(`${api}/admin/users?status=deleted`).set('Authorization', admin.auth);
        expect(deleted.body.data.map((u) => u.id)).toEqual([user.id]);
        expect((await request(app).get(`${api}/admin/stats`).set('Authorization', admin.auth)).body.totals.users).toBe(2);

        const participants = await request(app).get(`${api}/events/${past.id}/registrations`).set('Authorization', organizer.auth);
        expect(participants.body[0].user).toMatchObject({ name: User.DELETED_NAME });
        expect(participants.body[0].user.email ?? null).toBeNull();
        // повторное удаление – 404
        expect((await request(app).delete(`${api}/admin/users/${user.id}`).set('Authorization', admin.auth)).status).toBe(404);
    });

    it('организатора с будущими опубликованными мероприятиями удалить нельзя, пока они не отменены', async () => {
        const admin = await createAdmin();
        const organizer = await createOrganizer();
        const event = await createEvent({ organizerId: organizer.id });
        await createEvent({ organizerId: organizer.id, startsAt: inDays(-3) });
        const res = await request(app).delete(`${api}/admin/users/${organizer.id}`).set('Authorization', admin.auth);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('ORGANIZER_HAS_FUTURE_EVENTS');
        expect((await User.findByPk(organizer.id)).status).toBe('active');

        await request(app).post(`${api}/events/${event.id}/cancel`).set('Authorization', organizer.auth).send({ reason: 'Перенос в другой формат' });
        expect((await request(app).delete(`${api}/admin/users/${organizer.id}`).set('Authorization', admin.auth)).status).toBe(204);
        // прошедшие и отмененные мероприятия остаются со ссылкой на обезличенного организатора
        expect(await Event.count({ where: { organizerId: organizer.id } })).toBe(2);
    });

    it('администратор не может удалить себя', async () => {
        const admin = await createAdmin();
        expect((await request(app).delete(`${api}/admin/users/${admin.id}`).set('Authorization', admin.auth)).status).toBe(400);
    });
});

describe('Онлайн-ссылка не раскрывается в обход правил', () => {
    const URL_PART = 'secret-room';

    const setup = async () => {
        const organizer = await createOrganizer();
        const event = await createEvent({
            organizerId: organizer.id, title: 'Онлайн-встреча', tags: ['онлайн'],
            location: { online: true, url: `https://meet.example.com/${URL_PART}` }
        });
        return { organizer, event };
    };
    const body = (res) => JSON.stringify(res.body ?? res.text);

    it('каталог, карточка, календарь и ics – без ссылки для гостя и незарегистрированного', async () => {
        const { event } = await setup();
        const user = await createUser();
        const responses = await Promise.all([
            request(app).get(`${api}/events`),
            request(app).get(`${api}/events/${event.id}`),
            request(app).get(`${api}/events/${event.id}`).set('Authorization', user.auth),
            request(app).get(`${api}/events/${event.id}/calendar.ics`).set('Authorization', user.auth)
        ]);
        for (const res of responses) {
            expect(res.status).toBe(200);
            expect(body(res)).not.toContain(URL_PART);
        }
        // похожие мероприятия
        const other = await createEvent({ tags: ['онлайн'] });
        const similar = await request(app).get(`${api}/events/${other.id}/similar`);
        expect(similar.body.map((e) => e.id)).toContain(event.id);
        expect(body(similar)).not.toContain(URL_PART);
        expect(responses[1].body.location).toMatchObject({ online: true });
    });

    it('активный участник видит ссылку в карточке и своих регистрациях, но не в ics и уведомлениях; после отмены – нет', async () => {
        const { organizer, event } = await setup();
        const user = await createUser();
        const { registration } = await registerUser(event, user);
        expect(body(await request(app).get(`${api}/events/${event.id}`).set('Authorization', user.auth))).toContain(URL_PART);
        expect(body(await request(app).get(`${api}/auth/me/registrations`).set('Authorization', user.auth))).toContain(URL_PART);
        const ics = await request(app).get(`${api}/events/${event.id}/calendar.ics`).set('Authorization', user.auth);
        expect(ics.status).toBe(200);
        expect(ics.text).toContain('Онлайн-встреча');
        expect(ics.text).not.toContain(URL_PART);

        // смена ссылки: уведомление сообщает только факт изменения
        await request(app).patch(`${api}/events/${event.id}`).set('Authorization', organizer.auth)
            .send({ location: { online: true, url: `https://meet.example.com/${URL_PART}-2` } });
        const notes = await request(app).get(`${api}/notifications`).set('Authorization', user.auth);
        expect(notes.body.data.length).toBeGreaterThan(0);
        expect(body(notes)).not.toContain(URL_PART);

        await request(app).delete(`${api}/registrations/${registration.id}`).set('Authorization', user.auth);
        expect(body(await request(app).get(`${api}/events/${event.id}`).set('Authorization', user.auth))).not.toContain(URL_PART);
        expect(body(await request(app).get(`${api}/auth/me/registrations?status=all`).set('Authorization', user.auth))).not.toContain(URL_PART);
    });

    it('отмененное мероприятие: ссылка скрыта и от бывших участников; организатор видит', async () => {
        const { organizer, event } = await setup();
        const user = await createUser();
        await registerUser(event, user);
        await request(app).post(`${api}/events/${event.id}/cancel`).set('Authorization', organizer.auth).send({ reason: 'Отмена' });
        expect(body(await request(app).get(`${api}/events/${event.id}`).set('Authorization', user.auth))).not.toContain(URL_PART);
        expect(body(await request(app).get(`${api}/events/${event.id}`).set('Authorization', organizer.auth))).toContain(URL_PART);
    });
});

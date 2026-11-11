const { useTestDB, createUser, createAdmin, createEvent, createCategory, inDays, missingId } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { Event, Registration, Reminder, Favorite } = require('../src/models');

useTestDB();

describe('Категории', () => {
    it('GET – публичный список с числом предстоящих мероприятий', async () => {
        const it = await createCategory({ name: 'IT' });
        await createCategory({ name: 'Бизнес' });
        await createEvent({ category: it.id });
        await createEvent({ category: it.id, startsAt: inDays(-1) });
        const res = await request(app).get('/api/v1/categories');
        expect(res.body.map((c) => [c.name, c.eventsCount])).toEqual([['Бизнес', 0], ['IT', 1]]);
    });

    it('администратор создает категорию: slug из кириллицы, 409 для дубликата', async () => {
        const admin = await createAdmin();
        const res = await request(app).post('/api/v1/categories').set('Authorization', admin.auth)
            .send({ name: 'Бизнес и стартапы', color: '#f59e0b' });
        expect(res.status).toBe(201);
        expect(res.body.slug).toBe('biznes-i-startapy');
        const dup = await request(app).post('/api/v1/categories').set('Authorization', admin.auth).send({ name: 'Бизнес и стартапы' });
        expect(dup.status).toBe(409);
    });

    it('PATCH обновляет, DELETE оставляет мероприятия без категории; пользователю – 403', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const cat = await createCategory({ name: 'Старое' });
        const event = await createEvent({ category: cat.id });
        expect((await request(app).post('/api/v1/categories').set('Authorization', user.auth).send({ name: 'X1' })).status).toBe(403);
        const upd = await request(app).patch(`/api/v1/categories/${cat.id}`).set('Authorization', admin.auth).send({ name: 'Дизайн' });
        expect(upd.body).toMatchObject({ name: 'Дизайн', slug: 'dizayn' });
        expect((await request(app).delete(`/api/v1/categories/${cat.id}`).set('Authorization', admin.auth)).status).toBe(204);
        expect((await Event.findByPk(event.id)).categoryId).toBeNull();
        expect((await request(app).delete(`/api/v1/categories/${cat.id}`).set('Authorization', admin.auth)).status).toBe(404);
    });
});

describe('Избранное', () => {
    it('добавление без дубликатов, список и удаление', async () => {
        const user = await createUser();
        const event = await createEvent();
        const url = `/api/v1/auth/me/favorites/${event.id}`;
        expect((await request(app).put(url).set('Authorization', user.auth)).status).toBe(204);
        await request(app).put(url).set('Authorization', user.auth);
        const list = await request(app).get('/api/v1/auth/me/favorites').set('Authorization', user.auth);
        expect(list.body.map((e) => e.id)).toEqual([event.id]);
        expect((await request(app).delete(url).set('Authorization', user.auth)).status).toBe(204);
        expect(await Favorite.count({ where: { userId: user.id } })).toBe(0);
        expect((await request(app).put(`/api/v1/auth/me/favorites/${missingId}`).set('Authorization', user.auth)).status).toBe(404);
    });
});

describe('Администрирование пользователей', () => {
    it('список с поиском и пагинацией; обычному пользователю – 403', async () => {
        const admin = await createAdmin({ name: 'Админ' });
        await createUser({ name: 'Анна Петрова' });
        await createUser({ name: 'Иван Сидоров' });
        const res = await request(app).get('/api/v1/admin/users?search=анна').set('Authorization', admin.auth);
        expect(res.body.data.map((u) => u.name)).toEqual(['Анна Петрова']);
        expect(res.body.meta.total).toBe(1);
        expect(res.body.data[0].passwordHash).toBeUndefined();
        const user = await createUser();
        expect((await request(app).get('/api/v1/admin/users').set('Authorization', user.auth)).status).toBe(403);
    });

    it('назначение роли и блокировка; себя изменить нельзя', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const res = await request(app).patch(`/api/v1/admin/users/${user.id}`).set('Authorization', admin.auth).send({ blocked: true });
        expect(res.body.blocked).toBe(true);
        expect((await request(app).get('/api/v1/auth/me').set('Authorization', user.auth)).status).toBe(403);
        const self = await request(app).patch(`/api/v1/admin/users/${admin.id}`).set('Authorization', admin.auth).send({ role: 'user' });
        expect(self.status).toBe(400);
    });

    it('удаление пользователя освобождает места и удаляет регистрации и напоминания', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const event = await createEvent({ capacity: 5 });
        await request(app).post(`/api/v1/events/${event.id}/registrations`).set('Authorization', user.auth).send({ tickets: 3 });
        expect((await request(app).delete(`/api/v1/admin/users/${user.id}`).set('Authorization', admin.auth)).status).toBe(204);
        expect((await Event.findByPk(event.id)).seatsTaken).toBe(0);
        expect(await Registration.count()).toBe(0);
        expect(await Reminder.count()).toBe(0);
        expect((await request(app).delete(`/api/v1/admin/users/${admin.id}`).set('Authorization', admin.auth)).status).toBe(400);
    });
});

describe('Статистика', () => {
    it('сводка: итоги, по типам, по категориям, топ и динамика регистраций', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const cat = await createCategory({ name: 'IT', color: '#6366f1' });
        const event = await createEvent({ type: 'conference', category: cat.id, capacity: 100 });
        await createEvent({ type: 'webinar' });
        await request(app).post(`/api/v1/events/${event.id}/registrations`).set('Authorization', user.auth).send({ tickets: 4 });

        const res = await request(app).get('/api/v1/admin/stats').set('Authorization', admin.auth);
        expect(res.status).toBe(200);
        expect(res.body.totals).toMatchObject({ events: 2, upcoming: 2, users: 2, registrations: 1, tickets: 4 });
        expect(res.body.byType).toEqual(expect.arrayContaining([{ type: 'conference', events: 1, seats: 4 }]));
        expect(res.body.byCategory).toEqual(expect.arrayContaining([
            { name: 'IT', color: '#6366f1', events: 1, seats: 4 },
            { name: 'Без категории', color: '#94a3b8', events: 1, seats: 0 }
        ]));
        expect(res.body.topEvents[0].title).toBe(event.title);
        expect(res.body.timeline).toHaveLength(1);
    });
});

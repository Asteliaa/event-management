const { tokenFor, useMemoryDB } = require('./helpers');
const request = require('supertest');
const { Event } = require('../models');
const app = require('../server');

useMemoryDB();

const admin = () => `Bearer ${tokenFor({ role: 'admin' })}`;
const user = () => `Bearer ${tokenFor()}`;
const body = { title: 'T', type: 'webinar', date: '2026-11-05' };
const missingId = '0'.repeat(24);

const seed = () => Event.create([
    { title: 'React для начинающих', type: 'webinar', date: '2026-11-20', tags: ['frontend', 'важный'], location: { online: true } },
    { title: 'Конференция', type: 'conference', date: '2026-12-01', tags: ['backend'], location: { city: 'Минск' } },
    { title: 'Встреча', type: 'meeting', date: '2026-11-10', location: { city: 'Гродно' } }
]);

describe('GET /events (публичный)', () => {
    it('200 список, отсортированный по дате, с id вместо _id', async () => {
        await seed();
        const res = await request(app).get('/events');
        expect(res.status).toBe(200);
        expect(res.body.map((e) => e.title)).toEqual(['Встреча', 'React для начинающих', 'Конференция']);
        expect(res.body[0].id).toMatch(/^[0-9a-f]{24}$/);
        expect(res.body[0]._id).toBeUndefined();
        expect(res.body[0].__v).toBeUndefined();
    });

    it('поиск по названию без учета регистра и фильтр по типу', async () => {
        await seed();
        const res = await request(app).get('/api/events?search=REACT&type=webinar');
        expect(res.body.map((e) => e.title)).toEqual(['React для начинающих']);
    });

    it('спецсимволы в поиске не ломают регулярное выражение', async () => {
        await seed();
        const res = await request(app).get('/events?search=(');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('фильтр по тегу (массив содержит значение) и по вложенному полю location.city', async () => {
        await seed();
        expect((await request(app).get('/events?tag=Важный')).body.map((e) => e.title)).toEqual(['React для начинающих']);
        expect((await request(app).get('/events?city=Минск')).body.map((e) => e.title)).toEqual(['Конференция']);
    });

    it('500 при ошибке', async () => {
        const spy = jest.spyOn(Event, 'find').mockImplementationOnce(() => { throw new Error('db'); });
        expect((await request(app).get('/events')).status).toBe(500);
        spy.mockRestore();
    });
});

describe('GET /events/:id', () => {
    it('200 с виртуальными полями мест', async () => {
        const event = await Event.create({ ...body, capacity: 10, registrations: [{ name: 'A', email: 'a@b.c', tickets: 3 }] });
        const res = await request(app).get(`/events/${event.id}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ title: 'T', seatsTaken: 3, seatsLeft: 7 });
        expect(res.body.registrations[0].id).toMatch(/^[0-9a-f]{24}$/);
    });

    it('404', async () => {
        expect((await request(app).get(`/events/${missingId}`)).status).toBe(404);
    });

    it('400 для некорректного ObjectId', async () => {
        expect((await request(app).get('/events/2')).status).toBe(400);
    });

    it('500', async () => {
        const spy = jest.spyOn(Event, 'findById').mockImplementationOnce(() => { throw new Error('db'); });
        expect((await request(app).get(`/events/${missingId}`)).status).toBe(500);
        spy.mockRestore();
    });
});

describe('POST /events', () => {
    it('401 без токена', async () => {
        expect((await request(app).post('/events').send(body)).status).toBe(401);
    });

    it('403 для user', async () => {
        const res = await request(app).post('/events').set('Authorization', user()).send(body);
        expect(res.status).toBe(403);
        expect(await Event.countDocuments()).toBe(0);
    });

    it('400 без обязательных полей', async () => {
        const res = await request(app).post('/events').set('Authorization', admin()).send({ title: 'T' });
        expect(res.status).toBe(400);
    });

    it('400 при нарушении схемы (неизвестный тип)', async () => {
        const res = await request(app).post('/events').set('Authorization', admin()).send({ ...body, type: 'party' });
        expect(res.status).toBe(400);
    });

    it('201 для admin, сохраняет вложенные поля и игнорирует лишние', async () => {
        const res = await request(app).post('/events').set('Authorization', admin())
            .send({ ...body, tags: ['IT'], location: { city: 'Минск' }, registrations: [{ name: 'hack', email: 'h@h.h' }] });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ title: 'T', tags: ['it'], location: { city: 'Минск', online: false }, registrations: [] });
        expect(await Event.countDocuments()).toBe(1);
    });

    it('500 при ошибке', async () => {
        const spy = jest.spyOn(Event, 'create').mockRejectedValueOnce(new Error('db'));
        const res = await request(app).post('/events').set('Authorization', admin()).send(body);
        expect(res.status).toBe(500);
        spy.mockRestore();
    });
});

describe('PUT /events/:id', () => {
    it('401 без токена', async () => {
        expect((await request(app).put(`/events/${missingId}`).send({})).status).toBe(401);
    });

    it('403 для user', async () => {
        expect((await request(app).put(`/events/${missingId}`).set('Authorization', user()).send({})).status).toBe(403);
    });

    it('404 если не найдено', async () => {
        const res = await request(app).put(`/events/${missingId}`).set('Authorization', admin()).send({ title: 'X' });
        expect(res.status).toBe(404);
    });

    it('200 для admin, возвращает обновлённый документ', async () => {
        const event = await Event.create(body);
        const res = await request(app).put(`/api/events/${event.id}`).set('Authorization', admin())
            .send({ title: 'X', capacity: 5, id: 'zzz', createdAt: 'x' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: event.id, title: 'X', capacity: 5 });
    });

    it('400 при нарушении валидации', async () => {
        const event = await Event.create(body);
        const res = await request(app).put(`/events/${event.id}`).set('Authorization', admin()).send({ capacity: 0 });
        expect(res.status).toBe(400);
    });

    it('500 при ошибке', async () => {
        const spy = jest.spyOn(Event, 'findByIdAndUpdate').mockImplementationOnce(() => { throw new Error('db'); });
        expect((await request(app).put(`/events/${missingId}`).set('Authorization', admin()).send({})).status).toBe(500);
        spy.mockRestore();
    });
});

describe('DELETE /events/:id', () => {
    it('401 без токена', async () => {
        expect((await request(app).delete(`/events/${missingId}`)).status).toBe(401);
    });

    it('403 для user', async () => {
        expect((await request(app).delete(`/events/${missingId}`).set('Authorization', user())).status).toBe(403);
    });

    it('404 если не найдено', async () => {
        expect((await request(app).delete(`/events/${missingId}`).set('Authorization', admin())).status).toBe(404);
    });

    it('200 для admin и возвращает удалённый документ вместе с регистрациями', async () => {
        const event = await Event.create({ ...body, registrations: [{ name: 'A', email: 'a@b.c' }] });
        const res = await request(app).delete(`/events/${event.id}`).set('Authorization', admin());
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: event.id, title: 'T' });
        expect(res.body.registrations).toHaveLength(1);
        expect(await Event.countDocuments()).toBe(0);
    });

    it('500 при ошибке', async () => {
        const spy = jest.spyOn(Event, 'findByIdAndDelete').mockImplementationOnce(() => { throw new Error('db'); });
        expect((await request(app).delete(`/events/${missingId}`).set('Authorization', admin())).status).toBe(500);
        spy.mockRestore();
    });
});

describe('GET /events/stats (aggregation pipeline)', () => {
    it('считает мероприятия, участников и билеты по типам без отменённых', async () => {
        await Event.create([
            { ...body, registrations: [{ name: 'A', email: 'a@a.a', tickets: 2 }, { name: 'B', email: 'b@b.b', tickets: 5, status: 'cancelled' }] },
            { ...body, registrations: [{ name: 'C', email: 'c@c.c', tickets: 1 }] },
            { ...body, type: 'meeting' }
        ]);
        const res = await request(app).get('/events/stats');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            { type: 'webinar', events: 2, participants: 3, tickets: 3 },
            { type: 'meeting', events: 1, participants: 0, tickets: 0 }
        ]);
    });

    it('500 при ошибке', async () => {
        const spy = jest.spyOn(Event, 'aggregate').mockRejectedValueOnce(new Error('db'));
        expect((await request(app).get('/events/stats')).status).toBe(500);
        spy.mockRestore();
    });
});

describe('CORS', () => {
    it('ответ содержит заголовок CORS для клиента', async () => {
        const res = await request(app).get('/api/events').set('Origin', 'http://localhost:5173');
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
});

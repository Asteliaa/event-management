const { useTestDB, createUser, createAdmin, createEvent, createCategory, createEvents, inDays, missingId } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { Event, Registration, Reminder, Message, Favorite } = require('../src/models');

useTestDB();

const api = '/api/v1/events';

const seed = async () => {
    const it = await createCategory({ name: 'IT', color: '#6366f1' });
    const biz = await createCategory({ name: 'Бизнес', color: '#f59e0b' });
    await createEvents([
        { title: 'React для начинающих', type: 'webinar', startsAt: inDays(10), category: it.id, tags: ['frontend'], location: { online: true }, seatsTaken: 5 },
        { title: 'Конференция DevDay', type: 'conference', startsAt: inDays(20), category: it.id, tags: ['backend'], location: { city: 'Минск' }, seatsTaken: 50 },
        { title: 'Встреча стартапов', type: 'meeting', startsAt: inDays(3), category: biz.id, location: { city: 'Гродно' }, description: 'Нетворкинг и питчи' },
        { title: 'Прошедший вебинар', type: 'webinar', startsAt: inDays(-5) }
    ]);
    return { it, biz };
};

describe('GET /events – каталог', () => {
    it('по умолчанию предстоящие, по дате, с пагинацией и категорией', async () => {
        await seed();
        const res = await request(app).get(api);
        expect(res.status).toBe(200);
        expect(res.body.data.map((e) => e.title)).toEqual(['Встреча стартапов', 'React для начинающих', 'Конференция DevDay']);
        expect(res.body.meta).toEqual({ page: 1, limit: 12, total: 3, pages: 1 });
        expect(res.body.data[0].category).toMatchObject({ name: 'Бизнес', color: '#f59e0b' });
        expect(res.body.data[0].id).toMatch(/^[1-9]\d*$/);
        expect(res.body.data[0]._id).toBeUndefined();
    });

    it('when=past и when=all', async () => {
        await seed();
        expect((await request(app).get(`${api}?when=past`)).body.data.map((e) => e.title)).toEqual(['Прошедший вебинар']);
        expect((await request(app).get(`${api}?when=all`)).body.meta.total).toBe(4);
    });

    it('поиск по названию, описанию и тегу без учета регистра; спецсимволы безопасны', async () => {
        await seed();
        expect((await request(app).get(`${api}?search=REACT`)).body.data).toHaveLength(1);
        expect((await request(app).get(`${api}?search=питчи`)).body.data[0].title).toBe('Встреча стартапов');
        expect((await request(app).get(`${api}?search=backend`)).body.data[0].title).toBe('Конференция DevDay');
        const res = await request(app).get(`${api}?search=(`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    it('фильтры: тип, категория, город, онлайн, диапазон дат', async () => {
        const { it: itCat } = await seed();
        expect((await request(app).get(`${api}?type=conference`)).body.data).toHaveLength(1);
        expect((await request(app).get(`${api}?category=${itCat.id}`)).body.data).toHaveLength(2);
        expect((await request(app).get(`${api}?city=минск`)).body.data[0].title).toBe('Конференция DevDay');
        expect((await request(app).get(`${api}?online=true`)).body.data[0].title).toBe('React для начинающих');
        expect((await request(app).get(`${api}?online=false`)).body.data).toHaveLength(2);
        const to = inDays(15).toISOString();
        expect((await request(app).get(`${api}?to=${to}`)).body.data).toHaveLength(2);
    });

    it('сортировка по популярности и пагинация', async () => {
        await seed();
        const popular = await request(app).get(`${api}?sort=popular`);
        expect(popular.body.data[0].title).toBe('Конференция DevDay');
        const page2 = await request(app).get(`${api}?limit=2&page=2`);
        expect(page2.body.data).toHaveLength(1);
        expect(page2.body.meta).toMatchObject({ page: 2, pages: 2, total: 3 });
    });

    it('422 при некорректных параметрах', async () => {
        const res = await request(app).get(`${api}?type=party&limit=1000&category=bad`);
        expect(res.status).toBe(422);
        expect(res.body.error.details.map((d) => d.field)).toEqual(
            expect.arrayContaining(['query.type', 'query.limit', 'query.category']));
    });

    it('GET /events/cities – список городов без повторов', async () => {
        await seed();
        const res = await request(app).get(`${api}/cities`);
        expect(res.body.sort()).toEqual(['Гродно', 'Минск']);
    });
});

describe('GET /events/:id', () => {
    it('200 для гостя без персональных полей', async () => {
        const event = await createEvent({ capacity: 10, seatsTaken: 3 });
        const res = await request(app).get(`${api}/${event.id}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ title: event.title, seatsLeft: 7, isPast: false });
        expect(res.body.myRegistration).toBeUndefined();
    });

    it('для пользователя: регистрация, напоминания и избранное', async () => {
        const event = await createEvent();
        const user = await createUser();
        await Favorite.create({ userId: user.id, eventId: event.id });
        await request(app).post(`${api}/${event.id}/registrations`).set('Authorization', user.auth).send({});
        const res = await request(app).get(`${api}/${event.id}`).set('Authorization', user.auth);
        expect(res.body.isFavorite).toBe(true);
        expect(res.body.myRegistration).toMatchObject({ tickets: 1, status: 'registered' });
        expect(res.body.myReminders).toHaveLength(1);
    });

    it('422 при некорректном id, 404 при отсутствующем', async () => {
        expect((await request(app).get(`${api}/abc`)).status).toBe(422);
        expect((await request(app).get(`${api}/${missingId}`)).status).toBe(404);
    });

    it('похожие мероприятия по категории и тегам', async () => {
        const { it: itCat } = await seed();
        const react = await Event.findOne({ where: { title: 'React для начинающих' } });
        const res = await request(app).get(`${api}/${react.id}/similar`);
        expect(res.body.map((e) => e.title)).toEqual(['Конференция DevDay']);
        expect(itCat).toBeDefined();
    });

    it('calendar.ics – файл iCalendar', async () => {
        const event = await createEvent({ title: 'Вебинар, часть 1', location: { online: true } });
        const res = await request(app).get(`${api}/${event.id}/calendar.ics`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch('text/calendar');
        expect(res.headers['content-disposition']).toMatch('.ics');
        expect(res.text).toContain('BEGIN:VEVENT');
        expect(res.text).toContain('SUMMARY:Вебинар\\, часть 1');
    });
});

describe('Создание, изменение и удаление (администратор)', () => {
    const body = () => ({ title: 'Новый вебинар', type: 'webinar', startsAt: inDays(5).toISOString(), capacity: 30, tags: ['React', 'JS'] });

    it('401 без токена, 403 для обычного пользователя', async () => {
        const user = await createUser();
        expect((await request(app).post(api).send(body())).status).toBe(401);
        expect((await request(app).post(api).set('Authorization', user.auth).send(body())).status).toBe(403);
    });

    it('201: создает, приводит теги к нижнему регистру, заголовок Location', async () => {
        const admin = await createAdmin();
        const res = await request(app).post(api).set('Authorization', admin.auth).send(body());
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ title: 'Новый вебинар', tags: ['react', 'js'], seatsTaken: 0, seatsLeft: 30, status: 'published' });
        expect(res.headers.location).toBe(`/api/v1/events/${res.body.id}`);
        expect(String((await Event.findByPk(res.body.id)).organizerId)).toBe(admin.id);
    });

    it('422: обязательные поля и окончание раньше начала', async () => {
        const admin = await createAdmin();
        const res = await request(app).post(api).set('Authorization', admin.auth)
            .send({ title: 'X', type: 'party', startsAt: inDays(5), endsAt: inDays(4) });
        expect(res.status).toBe(422);
        expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['body.title', 'body.type']));
        const res2 = await request(app).post(api).set('Authorization', admin.auth)
            .send({ ...body(), endsAt: inDays(4).toISOString() });
        expect(res2.body.error.details[0].field).toBe('body.endsAt');
    });

    it('PATCH изменяет поля, null очищает вместимость', async () => {
        const admin = await createAdmin();
        const event = await createEvent({ capacity: 10 });
        const res = await request(app).patch(`${api}/${event.id}`).set('Authorization', admin.auth)
            .send({ title: 'Переименовано', capacity: null });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ title: 'Переименовано', seatsLeft: null });
        expect(res.body.capacity).toBeUndefined();
    });

    it('PATCH: 409, если вместимость меньше занятых мест; 404 для отсутствующего', async () => {
        const admin = await createAdmin();
        const event = await createEvent({ capacity: 10, seatsTaken: 6 });
        const res = await request(app).patch(`${api}/${event.id}`).set('Authorization', admin.auth).send({ capacity: 5 });
        expect(res.status).toBe(409);
        expect((await request(app).patch(`${api}/${missingId}`).set('Authorization', admin.auth).send({ title: 'Новое' })).status).toBe(404);
    });

    it('PATCH даты переносит неотправленные напоминания', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const event = await createEvent({ startsAt: inDays(10) });
        await request(app).post(`${api}/${event.id}/registrations`).set('Authorization', user.auth).send({});
        const newStart = inDays(12);
        await request(app).patch(`${api}/${event.id}`).set('Authorization', admin.auth).send({ startsAt: newStart.toISOString() });
        const reminder = await Reminder.findOne({ where: { eventId: event.id } });
        expect(reminder.remindAt.getTime()).toBe(newStart.getTime() - 24 * 3600e3);
    });

    it('DELETE: 204 и каскадное удаление связанных данных', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const event = await createEvent();
        await request(app).post(`${api}/${event.id}/registrations`).set('Authorization', user.auth).send({});
        await Favorite.create({ userId: user.id, eventId: event.id });
        await Message.create({ eventId: event.id, userId: user.id, author: user.name, text: 'Привет' });

        const res = await request(app).delete(`${api}/${event.id}`).set('Authorization', admin.auth);
        expect(res.status).toBe(204);
        expect(await Registration.count()).toBe(0);
        expect(await Reminder.count()).toBe(0);
        expect(await Message.count()).toBe(0);
        expect(await Favorite.count()).toBe(0);
        expect((await request(app).delete(`${api}/${event.id}`).set('Authorization', admin.auth)).status).toBe(404);
    });
});

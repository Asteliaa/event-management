const { useTestDB, createUser, createAdmin, createOrganizer, createEvent, createCategory, createEvents, inDays, missingId } = require('./helpers');
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
        expect(res.body.myRegistration).toMatchObject({ status: 'registered' });
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
    const body = () => ({
        title: 'Новый вебинар', type: 'webinar', timezone: 'Europe/Minsk', capacity: 30, tags: ['React', 'JS'],
        startsAt: inDays(5).toISOString(), endsAt: new Date(inDays(5).getTime() + 3600e3).toISOString(),
        location: { online: true, url: 'https://meet.example.com/demo' }
    });

    it('401 без токена, 403 для обычного пользователя', async () => {
        const user = await createUser();
        expect((await request(app).post(api).send(body())).status).toBe(401);
        expect((await request(app).post(api).set('Authorization', user.auth).send(body())).status).toBe(403);
    });

    it('201: по умолчанию создает черновик, приводит теги к нижнему регистру, заголовок Location', async () => {
        const admin = await createAdmin();
        const res = await request(app).post(api).set('Authorization', admin.auth).send(body());
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            title: 'Новый вебинар', tags: ['react', 'js'], seatsTaken: 0, seatsLeft: 30, status: 'draft',
            timezone: 'Europe/Minsk', scheduleVersion: 1, registrationOpen: true
        });
        expect(res.headers.location).toBe(`/api/v1/events/${res.body.id}`);
        expect(String((await Event.findByPk(res.body.id)).organizerId)).toBe(admin.id);
    });

    it('422: обязательные поля и окончание раньше начала', async () => {
        const admin = await createAdmin();
        const res = await request(app).post(api).set('Authorization', admin.auth)
            .send({ title: 'X', type: 'party', timezone: 'Mars/Olympus', startsAt: inDays(5), endsAt: inDays(4) });
        expect(res.status).toBe(422);
        expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['body.title', 'body.type', 'body.timezone']));
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

    it('PATCH даты переносит неотправленные напоминания (новая версия расписания)', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const event = await createEvent({ startsAt: inDays(10) });
        await request(app).post(`${api}/${event.id}/registrations`).set('Authorization', user.auth).send({});
        const newStart = inDays(12);
        // окончание раньше нового начала – 422, перенос не выполняется
        const bad = await request(app).patch(`${api}/${event.id}`).set('Authorization', admin.auth).send({ startsAt: newStart.toISOString() });
        expect(bad.status).toBe(422);
        await request(app).patch(`${api}/${event.id}`).set('Authorization', admin.auth)
            .send({ startsAt: newStart.toISOString(), endsAt: new Date(newStart.getTime() + 3600e3).toISOString() });
        const reminder = await Reminder.findOne({ where: { eventId: event.id } });
        expect(reminder.remindAt.getTime()).toBe(newStart.getTime() - 24 * 3600e3);
        expect(reminder.scheduleVersion).toBe(2);
    });

    it('DELETE: удалить можно только черновик; опубликованное – 409 EVENT_NOT_DRAFT', async () => {
        const admin = await createAdmin();
        const event = await createEvent();
        const res = await request(app).delete(`${api}/${event.id}`).set('Authorization', admin.auth);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('EVENT_NOT_DRAFT');
    });

    it('DELETE: 204 для черновика без регистраций, сообщения и избранное удаляются', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const event = await createEvent({ status: 'draft' });
        await Favorite.create({ userId: user.id, eventId: event.id });
        await Message.create({ eventId: event.id, userId: user.id, author: user.name, text: 'Привет' });

        const res = await request(app).delete(`${api}/${event.id}`).set('Authorization', admin.auth);
        expect(res.status).toBe(204);
        expect(await Message.count()).toBe(0);
        expect(await Favorite.count()).toBe(0);
        expect((await request(app).delete(`${api}/${event.id}`).set('Authorization', admin.auth)).status).toBe(404);
    });
});

describe('Организатор и владение мероприятиями', () => {
    const body = () => ({ title: 'Митап организатора', type: 'meeting', timezone: 'Asia/Tokyo', startsAt: inDays(5).toISOString() });

    it('организатор создает мероприятие и становится его владельцем; участник создать не может', async () => {
        const organizer = await createOrganizer();
        const res = await request(app).post(api).set('Authorization', organizer.auth).send(body());
        expect(res.status).toBe(201);
        expect(res.body.organizer.id).toBe(organizer.id);
        const user = await createUser();
        const denied = await request(app).post(api).set('Authorization', user.auth).send(body());
        expect(denied.status).toBe(403);
        expect(denied.body.error.message).toMatch('организаторов');
    });

    it('организатор изменяет и удаляет только свои мероприятия', async () => {
        const owner = await createOrganizer();
        const stranger = await createOrganizer();
        const event = await createEvent({ organizerId: owner.id, status: 'draft' });
        const url = `${api}/${event.id}`;
        // чужой черновик для постороннего организатора не существует
        expect((await request(app).patch(url).set('Authorization', stranger.auth).send({ title: 'Чужое' })).status).toBe(404);
        await event.update({ status: 'published' });
        expect((await request(app).patch(url).set('Authorization', stranger.auth).send({ title: 'Чужое' })).status).toBe(403);
        await event.update({ status: 'draft' });
        expect((await request(app).delete(url).set('Authorization', stranger.auth)).status).toBe(404);
        expect((await request(app).patch(url).set('Authorization', owner.auth).send({ title: 'Мое' })).body.title).toBe('Мое');
        expect((await request(app).delete(url).set('Authorization', owner.auth)).status).toBe(204);
    });

    it('без роли организатора права на прежние мероприятия теряются', async () => {
        const owner = await createOrganizer();
        const event = await createEvent({ organizerId: owner.id });
        await owner.update({ role: 'user' });
        expect((await request(app).patch(`${api}/${event.id}`).set('Authorization', owner.auth).send({ title: 'Чужое' })).status).toBe(403);
    });

    it('передать мероприятие может только администратор и только организатору или администратору', async () => {
        const admin = await createAdmin();
        const owner = await createOrganizer();
        const next = await createOrganizer();
        const user = await createUser();
        const event = await createEvent({ organizerId: owner.id });
        const url = `${api}/${event.id}`;
        expect((await request(app).patch(url).set('Authorization', owner.auth).send({ organizer: next.id })).status).toBe(403);
        expect((await request(app).patch(url).set('Authorization', admin.auth).send({ organizer: user.id })).status).toBe(422);
        const res = await request(app).patch(url).set('Authorization', admin.auth).send({ organizer: next.id });
        expect(res.body.organizer.id).toBe(next.id);
        expect((await request(app).patch(url).set('Authorization', owner.auth).send({ title: 'Чужое' })).status).toBe(403);
        expect((await request(app).patch(url).set('Authorization', next.auth).send({ title: 'Новый владелец' })).status).toBe(200);
    });

    it('GET /events/managed: свои мероприятия со счетчиками регистраций; администратор с all=true видит все', async () => {
        const admin = await createAdmin();
        const owner = await createOrganizer();
        const mine = await createEvent({ title: 'Мое', organizerId: owner.id });
        await createEvent({ title: 'Чужое', organizerId: admin.id });
        const user = await createUser();
        await request(app).post(`${api}/${mine.id}/registrations`).set('Authorization', user.auth).send({});

        const res = await request(app).get(`${api}/managed`).set('Authorization', owner.auth);
        expect(res.status).toBe(200);
        expect(res.body.data.map((e) => e.title)).toEqual(['Мое']);
        expect(res.body.data[0].registrations).toEqual({ active: 1, attended: 0, cancelled: 0 });
        expect((await request(app).get(`${api}/managed?all=true`).set('Authorization', admin.auth)).body.meta.total).toBe(2);
        expect((await request(app).get(`${api}/managed`).set('Authorization', user.auth)).status).toBe(403);
    });

    it('статистика мероприятия доступна владельцу и администратору', async () => {
        const owner = await createOrganizer();
        const event = await createEvent({ organizerId: owner.id, capacity: 4 });
        const users = await Promise.all([createUser(), createUser()]);
        for (const u of users) await request(app).post(`${api}/${event.id}/registrations`).set('Authorization', u.auth).send({});
        const res = await request(app).get(`${api}/${event.id}/stats`).set('Authorization', owner.auth);
        expect(res.body).toMatchObject({ registrations: { active: 2, cancelled: 0, attended: 0 }, fillRate: 50 });
        expect((await request(app).get(`${api}/${event.id}/stats`).set('Authorization', users[0].auth)).status).toBe(403);
        expect((await request(app).get(`${api}/${event.id}/stats`).set('Authorization', (await createOrganizer()).auth)).status).toBe(403);
    });
});

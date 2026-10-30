const { tokenFor, bearer, useMemoryDB } = require('./helpers');
const request = require('supertest');
const mongoose = require('mongoose');
const { Event } = require('../models');
const app = require('../server');

useMemoryDB();

const anna = { id: new mongoose.Types.ObjectId().toString(), email: 'anna@b.c', role: 'user' };
const ivan = { id: new mongoose.Types.ObjectId().toString(), email: 'ivan@b.c', role: 'user' };
const admin = () => `Bearer ${tokenFor({ role: 'admin' })}`;
const missingId = '0'.repeat(24);

const newEvent = (extra = {}) => Event.create({ title: 'T', type: 'webinar', date: '2026-11-05', capacity: 5, ...extra });
const registerAs = (who, event, data = {}) =>
    request(app).post(`/events/${event.id}/registrations`).set('Authorization', bearer(who)).send(data);

describe('POST /events/:id/registrations', () => {
    it('401 без токена', async () => {
        const event = await newEvent();
        expect((await request(app).post(`/events/${event.id}/registrations`).send({})).status).toBe(401);
    });

    it('201 добавляет регистрацию во вложенный массив', async () => {
        const event = await newEvent();
        const res = await registerAs(anna, event, { name: 'Анна', tickets: 2 });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ name: 'Анна', email: 'anna@b.c', tickets: 2, status: 'registered', user: anna.id });

        const saved = await Event.findById(event.id);
        expect(saved.registrations).toHaveLength(1);
        expect(saved.seatsLeft).toBe(3);
    });

    it('по умолчанию 1 билет и имя = email', async () => {
        const event = await newEvent();
        const res = await registerAs(anna, event);
        expect(res.body).toMatchObject({ name: 'anna@b.c', tickets: 1 });
    });

    it('400 при некорректном числе билетов', async () => {
        const event = await newEvent();
        expect((await registerAs(anna, event, { tickets: 0 })).status).toBe(400);
        expect((await registerAs(anna, event, { tickets: '2' })).status).toBe(400);
    });

    it('404 если мероприятия нет', async () => {
        expect((await registerAs(anna, { id: missingId })).status).toBe(404);
    });

    it('409 при повторной регистрации', async () => {
        const event = await newEvent();
        await registerAs(anna, event);
        expect((await registerAs(anna, event)).status).toBe(409);
    });

    it('409 если не хватает мест', async () => {
        const event = await newEvent({ capacity: 2 });
        await registerAs(anna, event, { tickets: 2 });
        const res = await registerAs(ivan, event);
        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/осталось: 0/);
    });

    it('без capacity места не ограничены', async () => {
        const event = await newEvent({ capacity: undefined });
        expect((await registerAs(anna, event, { tickets: 100 })).status).toBe(201);
        const res = await request(app).get(`/events/${event.id}`);
        expect(res.body.seatsLeft).toBeNull();
    });

    it('500 при ошибке', async () => {
        const spy = jest.spyOn(Event, 'findById').mockImplementationOnce(() => { throw new Error('db'); });
        expect((await registerAs(anna, { id: missingId })).status).toBe(500);
        spy.mockRestore();
    });
});

describe('PATCH /events/:id/registrations/:regId (обновление элемента массива)', () => {
    const setup = async () => {
        const event = await newEvent();
        const reg = (await registerAs(anna, event, { tickets: 1 })).body;
        return { event, reg, url: `/events/${event.id}/registrations/${reg.id}` };
    };

    it('владелец меняет число билетов через позиционный оператор $', async () => {
        const { event, url } = await setup();
        const res = await request(app).patch(url).set('Authorization', bearer(anna)).send({ tickets: 3 });
        expect(res.status).toBe(200);
        expect(res.body.tickets).toBe(3);
        expect((await Event.findById(event.id)).seatsTaken).toBe(3);
    });

    it('администратор меняет статус', async () => {
        const { url } = await setup();
        const res = await request(app).patch(url).set('Authorization', admin()).send({ status: 'attended' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('attended');
    });

    it('403 для чужой регистрации', async () => {
        const { url } = await setup();
        expect((await request(app).patch(url).set('Authorization', bearer(ivan)).send({ tickets: 2 })).status).toBe(403);
    });

    it('400 без полей, с неверным числом билетов или статусом', async () => {
        const { url } = await setup();
        const send = (data) => request(app).patch(url).set('Authorization', bearer(anna)).send(data);
        expect((await send({})).status).toBe(400);
        expect((await send({ tickets: -1 })).status).toBe(400);
        expect((await send({ status: 'lost' })).status).toBe(400);
    });

    it('409 если увеличение превышает вместимость', async () => {
        const { url } = await setup();
        const res = await request(app).patch(url).set('Authorization', bearer(anna)).send({ tickets: 6 });
        expect(res.status).toBe(409);
    });

    it('404 для несуществующей регистрации или мероприятия', async () => {
        const { event } = await setup();
        const auth = bearer(anna);
        expect((await request(app).patch(`/events/${event.id}/registrations/${missingId}`).set('Authorization', auth).send({ tickets: 2 })).status).toBe(404);
        expect((await request(app).patch(`/events/${missingId}/registrations/${missingId}`).set('Authorization', auth).send({ tickets: 2 })).status).toBe(404);
    });

    it('500 при ошибке', async () => {
        const { url } = await setup();
        const spy = jest.spyOn(Event, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('db'); });
        expect((await request(app).patch(url).set('Authorization', bearer(anna)).send({ tickets: 2 })).status).toBe(500);
        spy.mockRestore();
    });
});

describe('DELETE /events/:id/registrations/:regId ($pull)', () => {
    it('владелец отменяет регистрацию, элемент удаляется из массива', async () => {
        const event = await newEvent();
        const reg = (await registerAs(anna, event)).body;
        await registerAs(ivan, event);

        const res = await request(app).delete(`/events/${event.id}/registrations/${reg.id}`).set('Authorization', bearer(anna));
        expect(res.status).toBe(204);
        const saved = await Event.findById(event.id);
        expect(saved.registrations.map((r) => r.email)).toEqual(['ivan@b.c']);
    });

    it('403 для чужой, 404 для несуществующей', async () => {
        const event = await newEvent();
        const reg = (await registerAs(anna, event)).body;
        expect((await request(app).delete(`/events/${event.id}/registrations/${reg.id}`).set('Authorization', bearer(ivan))).status).toBe(403);
        expect((await request(app).delete(`/events/${event.id}/registrations/${missingId}`).set('Authorization', bearer(anna))).status).toBe(404);
    });

    it('500 при ошибке', async () => {
        const event = await newEvent();
        const reg = (await registerAs(anna, event)).body;
        const spy = jest.spyOn(Event, 'updateOne').mockImplementationOnce(() => { throw new Error('db'); });
        expect((await request(app).delete(`/events/${event.id}/registrations/${reg.id}`).set('Authorization', bearer(anna))).status).toBe(500);
        spy.mockRestore();
    });
});

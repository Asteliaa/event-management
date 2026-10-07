const { tokenFor } = require('./helpers');
const request = require('supertest');

jest.mock('../models', () => ({
    User: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() },
    Event: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn(), destroy: jest.fn() }
}));
const { Event } = require('../models');
const app = require('../server');

const admin = () => `Bearer ${tokenFor({ role: 'admin' })}`;
const user = () => `Bearer ${tokenFor()}`;
const body = { title: 'T', type: 'webinar', date: '2026-11-05' };

beforeEach(() => jest.resetAllMocks());

describe('GET /events (публичный)', () => {
    it('200 список', async () => {
        Event.findAll.mockResolvedValue([{ id: 1 }]);
        const res = await request(app).get('/events');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ id: 1 }]);
    });

    it('500 при ошибке', async () => {
        Event.findAll.mockRejectedValue(new Error('db'));
        expect((await request(app).get('/events')).status).toBe(500);
    });
});

describe('GET /events/:id', () => {
    it('200', async () => {
        Event.findByPk.mockResolvedValue({ id: 2 });
        expect((await request(app).get('/events/2')).status).toBe(200);
    });

    it('404', async () => {
        Event.findByPk.mockResolvedValue(null);
        expect((await request(app).get('/events/2')).status).toBe(404);
    });

    it('500', async () => {
        Event.findByPk.mockRejectedValue(new Error('db'));
        expect((await request(app).get('/events/2')).status).toBe(500);
    });
});

describe('POST /events', () => {
    it('401 без токена', async () => {
        expect((await request(app).post('/events').send(body)).status).toBe(401);
    });

    it('403 для user', async () => {
        const res = await request(app).post('/events').set('Authorization', user()).send(body);
        expect(res.status).toBe(403);
        expect(Event.create).not.toHaveBeenCalled();
    });

    it('400 без обязательных полей', async () => {
        const res = await request(app).post('/events').set('Authorization', admin()).send({ title: 'T' });
        expect(res.status).toBe(400);
    });

    it('201 для admin', async () => {
        Event.create.mockResolvedValue({ id: 3, ...body });
        const res = await request(app).post('/events').set('Authorization', admin()).send(body);
        expect(res.status).toBe(201);
        expect(res.body.id).toBe(3);
    });

    it('500 при ошибке', async () => {
        Event.create.mockRejectedValue(new Error('db'));
        const res = await request(app).post('/events').set('Authorization', admin()).send(body);
        expect(res.status).toBe(500);
    });
});

describe('PUT /events/:id', () => {
    it('401 без токена', async () => {
        expect((await request(app).put('/events/1').send({})).status).toBe(401);
    });

    it('403 для user', async () => {
        expect((await request(app).put('/events/1').set('Authorization', user()).send({})).status).toBe(403);
    });

    it('404 если не найдено', async () => {
        Event.update.mockResolvedValue([0]);
        expect((await request(app).put('/events/1').set('Authorization', admin()).send({ title: 'X' })).status).toBe(404);
    });

    it('200 для admin', async () => {
        Event.update.mockResolvedValue([1]);
        Event.findByPk.mockResolvedValue({ id: 1, title: 'X' });
        const res = await request(app).put('/events/1').set('Authorization', admin()).send({ title: 'X' });
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('X');
    });

    it('500 при ошибке', async () => {
        Event.update.mockRejectedValue(new Error('db'));
        expect((await request(app).put('/events/1').set('Authorization', admin()).send({})).status).toBe(500);
    });
});

describe('DELETE /events/:id', () => {
    it('401 без токена', async () => {
        expect((await request(app).delete('/events/1')).status).toBe(401);
    });

    it('403 для user', async () => {
        expect((await request(app).delete('/events/1').set('Authorization', user())).status).toBe(403);
    });

    it('404 если не найдено', async () => {
        Event.destroy.mockResolvedValue(0);
        expect((await request(app).delete('/events/1').set('Authorization', admin())).status).toBe(404);
    });

    it('204 для admin', async () => {
        Event.destroy.mockResolvedValue(1);
        expect((await request(app).delete('/events/1').set('Authorization', admin())).status).toBe(204);
    });

    it('500 при ошибке', async () => {
        Event.destroy.mockRejectedValue(new Error('db'));
        expect((await request(app).delete('/events/1').set('Authorization', admin())).status).toBe(500);
    });
});

describe('обработчик ошибок', () => {
    it('500 при некорректном JSON', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{bad');
        expect(res.status).toBe(500);
        spy.mockRestore();
    });
});

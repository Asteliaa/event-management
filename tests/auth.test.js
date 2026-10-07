const { tokenFor } = require('./helpers');
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

jest.mock('../models', () => ({
    User: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() },
    Event: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn(), destroy: jest.fn() }
}));
const { User } = require('../models');
const app = require('../server');

beforeEach(() => jest.resetAllMocks());

describe('POST /auth/register', () => {
    it('400 без email/password', async () => {
        const res = await request(app).post('/auth/register').send({ email: 'a@b.c' });
        expect(res.status).toBe(400);
    });

    it('409 если email занят', async () => {
        User.findOne.mockResolvedValue({ id: 1 });
        const res = await request(app).post('/auth/register').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(409);
        expect(User.create).not.toHaveBeenCalled();
    });

    it('201 и хеширует пароль', async () => {
        User.findOne.mockResolvedValue(null);
        User.create.mockImplementation(async (d) => ({ id: 5, email: d.email, role: 'user' }));
        const res = await request(app).post('/auth/register').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(201);
        expect(res.body).toEqual({ id: 5, email: 'a@b.c', role: 'user' });
        const { passwordHash } = User.create.mock.calls[0][0];
        expect(passwordHash).not.toBe('pw');
        expect(await bcrypt.compare('pw', passwordHash)).toBe(true);
    });

    it('500 при ошибке БД', async () => {
        User.findOne.mockRejectedValue(new Error('db'));
        const res = await request(app).post('/auth/register').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(500);
    });
});

describe('POST /auth/login', () => {
    it('400 без полей', async () => {
        const res = await request(app).post('/auth/login').send({});
        expect(res.status).toBe(400);
    });

    it('401 если пользователь не найден', async () => {
        User.findOne.mockResolvedValue(null);
        const res = await request(app).post('/auth/login').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(401);
    });

    it('401 при неверном пароле', async () => {
        User.findOne.mockResolvedValue({ id: 1, email: 'a@b.c', role: 'user', passwordHash: await bcrypt.hash('other', 4) });
        const res = await request(app).post('/auth/login').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(401);
    });

    it('200 и валидный JWT с id, email, role и сроком 1 час', async () => {
        User.findOne.mockResolvedValue({ id: 7, email: 'a@b.c', role: 'admin', passwordHash: await bcrypt.hash('pw', 4) });
        const res = await request(app).post('/auth/login').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(200);
        const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
        expect(decoded).toMatchObject({ id: 7, email: 'a@b.c', role: 'admin' });
        expect(decoded.exp - decoded.iat).toBe(3600);
    });

    it('500 при ошибке БД', async () => {
        User.findOne.mockRejectedValue(new Error('db'));
        const res = await request(app).post('/auth/login').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(500);
    });
});

describe('GET /profile', () => {
    it('401 без токена', async () => {
        const res = await request(app).get('/profile');
        expect(res.status).toBe(401);
    });

    it('401 с неверной схемой заголовка', async () => {
        const res = await request(app).get('/profile').set('Authorization', `Token ${tokenFor()}`);
        expect(res.status).toBe(401);
    });

    it('401 с мусорным токеном', async () => {
        const res = await request(app).get('/profile').set('Authorization', 'Bearer garbage');
        expect(res.status).toBe(401);
    });

    it('401 с токеном, подписанным другим ключом', async () => {
        const bad = jwt.sign({ id: 1 }, 'other-secret');
        const res = await request(app).get('/profile').set('Authorization', `Bearer ${bad}`);
        expect(res.status).toBe(401);
    });

    it('401 с просроченным токеном', async () => {
        const res = await request(app).get('/profile').set('Authorization', `Bearer ${tokenFor({}, { expiresIn: -10 })}`);
        expect(res.status).toBe(401);
    });

    it('200 с валидным токеном', async () => {
        User.findByPk.mockResolvedValue({ id: 1, email: 'a@b.c', role: 'user' });
        const res = await request(app).get('/profile').set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(200);
        expect(res.body.email).toBe('a@b.c');
        expect(User.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
    });

    it('404 если пользователь удалён', async () => {
        User.findByPk.mockResolvedValue(null);
        const res = await request(app).get('/profile').set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(404);
    });

    it('500 при ошибке БД', async () => {
        User.findByPk.mockRejectedValue(new Error('db'));
        const res = await request(app).get('/profile').set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(500);
    });
});

describe('GET /users (RBAC)', () => {
    it('401 без токена', async () => {
        expect((await request(app).get('/users')).status).toBe(401);
    });

    it('403 для обычного пользователя', async () => {
        const res = await request(app).get('/users').set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(403);
    });

    it('200 для администратора', async () => {
        User.findAll.mockResolvedValue([{ id: 1 }]);
        const res = await request(app).get('/users').set('Authorization', `Bearer ${tokenFor({ role: 'admin' })}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ id: 1 }]);
    });

    it('500 при ошибке БД', async () => {
        User.findAll.mockRejectedValue(new Error('db'));
        const res = await request(app).get('/users').set('Authorization', `Bearer ${tokenFor({ role: 'admin' })}`);
        expect(res.status).toBe(500);
    });
});

describe('общее поведение', () => {
    it('404 для неизвестного маршрута', async () => {
        expect((await request(app).get('/nope')).status).toBe(404);
    });
});

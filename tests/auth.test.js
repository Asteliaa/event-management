const { tokenFor, bearer, useMemoryDB } = require('./helpers');
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, Event } = require('../models');
const app = require('../server');

useMemoryDB();

const createUser = async (email = 'a@b.c', password = 'pw', role = 'user') =>
    User.create({ email, passwordHash: await bcrypt.hash(password, 4), role });

describe('POST /auth/register', () => {
    it('400 без email/password', async () => {
        const res = await request(app).post('/auth/register').send({ email: 'a@b.c' });
        expect(res.status).toBe(400);
    });

    it('201 и хеширует пароль', async () => {
        const res = await request(app).post('/auth/register').send({ email: 'A@B.c', password: 'pw' });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ email: 'a@b.c', role: 'user' });
        expect(res.body.id).toMatch(/^[0-9a-f]{24}$/);
        const saved = await User.findById(res.body.id);
        expect(saved.passwordHash).not.toBe('pw');
        expect(await bcrypt.compare('pw', saved.passwordHash)).toBe(true);
    });

    it('409 если email занят (без учета регистра)', async () => {
        await createUser();
        const res = await request(app).post('/auth/register').send({ email: 'A@b.c', password: 'pw' });
        expect(res.status).toBe(409);
        expect(await User.countDocuments()).toBe(1);
    });

    it('500 при ошибке БД', async () => {
        const spy = jest.spyOn(User, 'findOne').mockRejectedValueOnce(new Error('db'));
        const res = await request(app).post('/auth/register').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(500);
        spy.mockRestore();
    });
});

describe('POST /auth/login', () => {
    it('400 без полей', async () => {
        expect((await request(app).post('/auth/login').send({})).status).toBe(400);
    });

    it('401 если пользователь не найден', async () => {
        const res = await request(app).post('/auth/login').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(401);
    });

    it('401 при неверном пароле', async () => {
        await createUser('a@b.c', 'other');
        const res = await request(app).post('/auth/login').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(401);
    });

    it('200 и валидный JWT с id, email, role и сроком 1 час', async () => {
        const user = await createUser('a@b.c', 'pw', 'admin');
        const res = await request(app).post('/auth/login').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(200);
        const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
        expect(decoded).toMatchObject({ id: user.id, email: 'a@b.c', role: 'admin' });
        expect(decoded.exp - decoded.iat).toBe(3600);
    });

    it('500 при ошибке БД', async () => {
        const spy = jest.spyOn(User, 'findOne').mockRejectedValueOnce(new Error('db'));
        const res = await request(app).post('/auth/login').send({ email: 'a@b.c', password: 'pw' });
        expect(res.status).toBe(500);
        spy.mockRestore();
    });
});

describe('GET /profile', () => {
    it('401 без токена', async () => {
        expect((await request(app).get('/profile')).status).toBe(401);
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

    it('200 с валидным токеном, без passwordHash', async () => {
        const user = await createUser();
        const res = await request(app).get('/profile').set('Authorization', bearer(user));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: user.id, email: 'a@b.c', role: 'user' });
        expect(res.body.passwordHash).toBeUndefined();
    });

    it('404 если пользователь удалён', async () => {
        const res = await request(app).get('/profile').set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(404);
    });

    it('500 при ошибке БД', async () => {
        const spy = jest.spyOn(User, 'findById').mockImplementationOnce(() => { throw new Error('db'); });
        const res = await request(app).get('/profile').set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(500);
        spy.mockRestore();
    });
});

describe('GET /users и DELETE /users/:id (RBAC)', () => {
    const admin = () => `Bearer ${tokenFor({ role: 'admin' })}`;

    it('401 без токена', async () => {
        expect((await request(app).get('/users')).status).toBe(401);
    });

    it('403 для обычного пользователя', async () => {
        const res = await request(app).get('/users').set('Authorization', `Bearer ${tokenFor()}`);
        expect(res.status).toBe(403);
    });

    it('200 для администратора', async () => {
        await createUser();
        const res = await request(app).get('/users').set('Authorization', admin());
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].passwordHash).toBeUndefined();
    });

    it('500 при ошибке БД', async () => {
        const spy = jest.spyOn(User, 'find').mockImplementationOnce(() => { throw new Error('db'); });
        const res = await request(app).get('/users').set('Authorization', admin());
        expect(res.status).toBe(500);
        spy.mockRestore();
    });

    it('каскадно удаляет регистрации пользователя и возвращает удалённого', async () => {
        const user = await createUser();
        const other = await createUser('x@y.z');
        await Event.create({
            title: 'T', type: 'webinar', date: '2026-11-05',
            registrations: [
                { user: user._id, name: 'A', email: user.email },
                { user: other._id, name: 'X', email: other.email }
            ]
        });

        const res = await request(app).delete(`/users/${user.id}`).set('Authorization', admin());
        expect(res.status).toBe(200);
        expect(res.body.email).toBe('a@b.c');

        const event = await Event.findOne();
        expect(event.registrations.map((r) => r.email)).toEqual(['x@y.z']);
    });

    it('404 и 400 при удалении', async () => {
        expect((await request(app).delete(`/users/${'0'.repeat(24)}`).set('Authorization', admin())).status).toBe(404);
        expect((await request(app).delete('/users/1').set('Authorization', admin())).status).toBe(400);
    });

    it('500 при ошибке удаления', async () => {
        const spy = jest.spyOn(User, 'findByIdAndDelete').mockImplementationOnce(() => { throw new Error('db'); });
        const res = await request(app).delete(`/users/${'0'.repeat(24)}`).set('Authorization', admin());
        expect(res.status).toBe(500);
        spy.mockRestore();
    });
});

describe('общее поведение', () => {
    it('404 для неизвестного маршрута', async () => {
        expect((await request(app).get('/nope')).status).toBe(404);
    });

    it('500 при некорректном JSON', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{bad');
        expect(res.status).toBe(500);
        spy.mockRestore();
    });
});

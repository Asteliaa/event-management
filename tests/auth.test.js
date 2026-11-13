const { useTestDB, createUser } = require('./helpers');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { User } = require('../src/models');

useTestDB();

const api = '/api/v1/auth';
const valid = { name: 'Анна Петрова', email: 'Anna@Example.com', password: 'secret123' };

describe('POST /auth/register', () => {
    it('201: создает пользователя, возвращает профиль без хеша и JWT', async () => {
        const res = await request(app).post(`${api}/register`).send(valid);
        expect(res.status).toBe(201);
        expect(res.body.user).toMatchObject({ name: 'Анна Петрова', email: 'anna@example.com', role: 'user' });
        expect(res.body.user.passwordHash).toBeUndefined();
        expect(jwt.verify(res.body.token, 'test-secret')).toMatchObject({ id: res.body.user.id, role: 'user', tv: 0 });
        const stored = await User.scope('withPassword').findOne({ where: { email: 'anna@example.com' } });
        expect(stored.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    });

    it('409 при повторном email (без учета регистра)', async () => {
        await request(app).post(`${api}/register`).send(valid);
        const res = await request(app).post(`${api}/register`).send({ ...valid, email: 'ANNA@example.com' });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('422 с перечнем ошибок по полям', async () => {
        const res = await request(app).post(`${api}/register`).send({ name: 'A', email: 'bad', password: 'short' });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        const fields = res.body.error.details.map((d) => d.field);
        expect(fields).toEqual(expect.arrayContaining(['body.name', 'body.email', 'body.password']));
    });

    it('422: пароль без цифры', async () => {
        const res = await request(app).post(`${api}/register`).send({ ...valid, password: 'onlyletters' });
        expect(res.status).toBe(422);
        expect(res.body.error.details[0].message).toMatch(/цифру/);
    });

    it('лишние поля (role) игнорируются', async () => {
        const res = await request(app).post(`${api}/register`).send({ ...valid, role: 'admin' });
        expect(res.body.user.role).toBe('user');
    });
});

describe('POST /auth/login', () => {
    it('200 и токен при верных данных', async () => {
        const user = await createUser({ email: 'ivan@test.local' });
        const res = await request(app).post(`${api}/login`).send({ email: 'IVAN@test.local', password: 'secret123' });
        expect(res.status).toBe(200);
        expect(res.body.user.id).toBe(user.id);
        expect(res.body.token).toBeDefined();
    });

    it('401 с одинаковым сообщением для неверного пароля и неизвестного email', async () => {
        await createUser({ email: 'ivan@test.local' });
        const a = await request(app).post(`${api}/login`).send({ email: 'ivan@test.local', password: 'wrong123' });
        const b = await request(app).post(`${api}/login`).send({ email: 'nobody@test.local', password: 'wrong123' });
        expect(a.status).toBe(401);
        expect(b.status).toBe(401);
        expect(a.body.error.message).toBe(b.body.error.message);
    });

    it('403 для заблокированного пользователя', async () => {
        await createUser({ email: 'blocked@test.local', blocked: true });
        const res = await request(app).post(`${api}/login`).send({ email: 'blocked@test.local', password: 'secret123' });
        expect(res.status).toBe(403);
    });
});

describe('Защищенные маршруты /auth/me', () => {
    it('401 без токена, с неверным и с просроченным токеном', async () => {
        const user = await createUser();
        const expired = jwt.sign({ id: user.id }, 'test-secret', { expiresIn: -1 });
        expect((await request(app).get(`${api}/me`)).status).toBe(401);
        expect((await request(app).get(`${api}/me`).set('Authorization', 'Bearer abc')).status).toBe(401);
        expect((await request(app).get(`${api}/me`).set('Authorization', `Bearer ${expired}`)).status).toBe(401);
    });

    it('401, если пользователь удален после выдачи токена', async () => {
        const user = await createUser();
        await User.destroy({ where: { id: user.id } });
        expect((await request(app).get(`${api}/me`).set('Authorization', user.auth)).status).toBe(401);
    });

    it('403, если пользователь заблокирован после выдачи токена', async () => {
        const user = await createUser();
        await User.update({ blocked: true }, { where: { id: user.id } });
        expect((await request(app).get(`${api}/me`).set('Authorization', user.auth)).status).toBe(403);
    });

    it('GET /me возвращает профиль', async () => {
        const user = await createUser({ city: 'Минск' });
        const res = await request(app).get(`${api}/me`).set('Authorization', user.auth);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: user.id, city: 'Минск' });
    });

    it('PATCH /me изменяет имя и город', async () => {
        const user = await createUser();
        const res = await request(app).patch(`${api}/me`).set('Authorization', user.auth)
            .send({ name: 'Новое имя', city: 'Брест', email: 'hack@x.y' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ name: 'Новое имя', city: 'Брест', email: user.email });
    });

    it('PUT /me/password: 400 при неверном текущем пароле; новый токен, старый недействителен, вход с новым', async () => {
        const user = await createUser();
        const bad = await request(app).put(`${api}/me/password`).set('Authorization', user.auth)
            .send({ currentPassword: 'wrong', newPassword: 'newpass123' });
        expect(bad.status).toBe(400);
        const ok = await request(app).put(`${api}/me/password`).set('Authorization', user.auth)
            .send({ currentPassword: 'secret123', newPassword: 'newpass123' });
        expect(ok.status).toBe(200);
        expect((await request(app).get(`${api}/me`).set('Authorization', user.auth)).status).toBe(401);
        expect((await request(app).get(`${api}/me`).set('Authorization', `Bearer ${ok.body.token}`)).status).toBe(200);
        const login = await request(app).post(`${api}/login`).send({ email: user.email, password: 'newpass123' });
        expect(login.status).toBe(200);
    });
});

describe('Общие ответы сервера', () => {
    it('404 в едином формате для неизвестного адреса', async () => {
        const res = await request(app).get('/api/v1/unknown');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('400 на некорректный JSON', async () => {
        const res = await request(app).post(`${api}/login`).set('Content-Type', 'application/json').send('{bad');
        expect(res.status).toBe(400);
        expect(res.body.error.message).toMatch(/JSON/);
    });

    it('helmet добавляет защитные заголовки', async () => {
        const res = await request(app).get('/api/v1/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-powered-by']).toBeUndefined();
        expect(res.status).toBe(200);
    });

    it('документация OpenAPI доступна', async () => {
        const res = await request(app).get('/api/openapi.json');
        expect(res.status).toBe(200);
        expect(res.body.openapi).toMatch(/^3\./);
        expect(Object.keys(res.body.paths).length).toBeGreaterThan(15);
    });
});

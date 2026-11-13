// Восстановление пароля: одинаковый ответ, одноразовый токен с хешем в БД, срок, отзыв,
// атомарный сброс, отзыв сеансов, недоступный SMTP, ограничение частоты
const { useTestDB, createUser, createAdmin } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const config = require('../src/config');
const mail = require('../src/services/mail.service');
const { sequelize, User } = require('../src/models');

useTestDB();

const api = '/api/v1/auth';
let outbox;
let smtpDown;
beforeEach(() => {
    outbox = [];
    smtpDown = false;
    mail.setTestTransport({
        sendMail: async (message) => {
            if (smtpDown) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
            outbox.push(message);
        }
    });
});
afterAll(() => mail.setTestTransport(null));

// фоновая отправка письма завершается после ответа API
const flush = () => new Promise((r) => setTimeout(r, 150));
const forgot = (email, host) => {
    const req = request(app).post(`${api}/password/forgot`);
    if (host) req.set('Host', host);
    return req.send({ email });
};
const reset = (token, password = 'newpass123', passwordConfirm = password) =>
    request(app).post(`${api}/password/reset`).send({ token, password, passwordConfirm });
const login = (email, password) => request(app).post(`${api}/login`).send({ email, password });
const tokenFrom = (message) => message.text.match(/#token=([A-Za-z0-9_-]{43})/)[1];
const tokens = () => sequelize.query('SELECT * FROM password_reset_tokens ORDER BY id', { type: 'SELECT' });

const requestToken = async (user) => {
    await forgot(user.email);
    await flush();
    return tokenFrom(outbox.at(-1));
};

describe('Запрос восстановления', () => {
    it('ответ одинаков для существующего и неизвестного адреса; письмо – только существующему', async () => {
        const user = await createUser();
        const unknown = await forgot('nobody@test.local');
        const known = await forgot(user.email.toUpperCase());
        await flush();
        expect([unknown.status, known.status]).toEqual([202, 202]);
        expect(unknown.body).toEqual(known.body);
        expect(outbox.map((m) => m.to)).toEqual([user.email]);
    });

    it('ссылка строится из доверенного APP_URL, а не из Host; в БД только хеш токена со сроком 30 минут', async () => {
        const user = await createUser();
        await forgot(user.email, 'evil.example');
        await flush();
        const text = outbox[0].text;
        expect(text).toContain(`${config.appUrl}/reset-password#token=`);
        expect(text).not.toContain('evil.example');
        const token = tokenFrom(outbox[0]);
        const [row] = await tokens();
        expect(row.token_hash).toHaveLength(64);
        expect(JSON.stringify(row)).not.toContain(token);
        const minutes = (new Date(row.expires_at) - new Date(row.created_at)) / 60e3;
        expect(Math.round(minutes)).toBe(30);
    });

    it('новый запрос отменяет прежний токен', async () => {
        const user = await createUser();
        const first = await requestToken(user);
        const second = await requestToken(user);
        expect((await reset(first)).body.error.code).toBe('INVALID_RESET_TOKEN');
        expect((await reset(second)).status).toBe(200);
    });

    it('заблокированный, удаленный и деактивированный администратором аккаунт письма не получает', async () => {
        const admin = await createAdmin();
        const blocked = await createUser({ blocked: true, blockedAt: new Date() });
        const byAdmin = await createUser();
        await request(app).post(`/api/v1/admin/users/${byAdmin.id}/deactivate`).set('Authorization', admin.auth);
        const deleted = await createUser();
        const deletedEmail = deleted.email;
        await request(app).delete(`/api/v1/admin/users/${deleted.id}`).set('Authorization', admin.auth);
        for (const email of [blocked.email, byAdmin.email, deletedEmail]) expect((await forgot(email)).status).toBe(202);
        await flush();
        expect(outbox).toEqual([]);
        expect(await tokens()).toEqual([]);
    });

    it('недоступный SMTP: ответ тот же, пароль не меняется', async () => {
        const user = await createUser();
        smtpDown = true;
        const res = await forgot(user.email);
        await flush();
        expect(res.status).toBe(202);
        expect(res.body.message).toMatch(/Если аккаунт/);
        expect((await login(user.email, 'secret123')).status).toBe(200);
    });
});

describe('Сброс пароля', () => {
    it('новый пароль, все сеансы отозваны, токен одноразовый, уведомление без пароля, без автоматического входа', async () => {
        const user = await createUser();
        const token = await requestToken(user);
        const res = await reset(token, 'Brand-new-42');
        expect(res.status).toBe(200);
        expect(res.body.token).toBeUndefined();
        await flush();
        expect((await request(app).get(`${api}/me`).set('Authorization', user.auth)).status).toBe(401);
        expect((await login(user.email, 'secret123')).status).toBe(401);
        expect((await login(user.email, 'Brand-new-42')).status).toBe(200);
        expect((await reset(token, 'another-pass-1')).body.error.code).toBe('INVALID_RESET_TOKEN');
        const notice = outbox.at(-1);
        expect(notice.subject).toMatch(/пароль изменен/);
        expect(notice.text).not.toContain('Brand-new-42');
    });

    it('просроченный и неизвестный токен – 400; несовпадение подтверждения и неверный формат – 422', async () => {
        const user = await createUser();
        const token = await requestToken(user);
        await sequelize.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`);
        expect((await reset(token)).body.error.code).toBe('INVALID_RESET_TOKEN');
        expect((await reset('A'.repeat(43))).status).toBe(400);
        expect((await reset(token, 'newpass123', 'other123')).status).toBe(422);
        expect((await reset('short')).status).toBe(422);
    });

    it('два параллельных сброса одним токеном: успешен только один', async () => {
        const user = await createUser();
        const token = await requestToken(user);
        const results = await Promise.all([reset(token, 'first-pass-1'), reset(token, 'second-pass-2'), reset(token, 'third-pass-3')]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400]);
        const ok = ['first-pass-1', 'second-pass-2', 'third-pass-3'][results.findIndex((r) => r.status === 200)];
        expect((await login(user.email, ok)).status).toBe(200);
    });

    it('обычная смена пароля делает ссылки сброса недействительными', async () => {
        const user = await createUser();
        const token = await requestToken(user);
        await request(app).put(`${api}/me/password`).set('Authorization', user.auth)
            .send({ currentPassword: 'secret123', newPassword: 'changed-pass-1' });
        expect((await reset(token)).body.error.code).toBe('INVALID_RESET_TOKEN');
    });

    it('аккаунт заблокировали после выдачи ссылки – сброс не проходит', async () => {
        const admin = await createAdmin();
        const user = await createUser();
        const token = await requestToken(user);
        await request(app).patch(`/api/v1/admin/users/${user.id}`).set('Authorization', admin.auth).send({ blocked: true });
        expect((await reset(token)).body.error.code).toBe('INVALID_RESET_TOKEN');
        expect((await User.scope('withPassword').findByPk(user.id)).blocked).toBe(true);
    });

    it('самостоятельно деактивированный: сброс не активирует аккаунт, активирует последующий вход', async () => {
        const user = await createUser();
        await request(app).post(`${api}/me/deactivate`).set('Authorization', user.auth).send({ password: 'secret123' });
        const token = await requestToken(user);
        expect((await reset(token, 'after-reset-1')).status).toBe(200);
        expect((await User.findByPk(user.id)).status).toBe('deactivated');
        const res = await login(user.email, 'after-reset-1');
        expect(res.body).toMatchObject({ reactivated: true, user: { status: 'active' } });
    });
});

describe('Ограничение частоты', () => {
    beforeAll(() => { process.env.TEST_RATE_LIMIT = '1'; });
    afterAll(() => { delete process.env.TEST_RATE_LIMIT; });

    it('не больше 3 писем на адрес за час, затем 429 – одинаково для существующего и неизвестного адреса', async () => {
        const user = await createUser();
        for (const email of [user.email, 'ghost@test.local']) {
            for (let i = 0; i < 3; i += 1) expect((await forgot(email)).status).toBe(202);
            expect((await forgot(email)).status).toBe(429);
        }
        await flush();
        expect(outbox).toHaveLength(3);
    });

    it('не больше 10 запросов с одного IP за 15 минут', async () => {
        // предыдущий тест уже израсходовал 8 запросов с этого IP
        expect((await forgot('a1@test.local')).status).toBe(202);
        expect((await forgot('a2@test.local')).status).toBe(202);
        expect((await forgot('a3@test.local')).status).toBe(429);
    });
});

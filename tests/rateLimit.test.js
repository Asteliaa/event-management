process.env.TEST_RATE_LIMIT = '1';
process.env.AUTH_RATE_LIMIT = '3';
const request = require('supertest');
const app = require('../src/app');

describe('Ограничение попыток входа', () => {
    it('после лимита возвращает 429', async () => {
        const body = { email: 'x@y.z', password: '' };
        for (let i = 0; i < 3; i += 1) {
            expect((await request(app).post('/api/v1/auth/login').send(body)).status).toBe(422);
        }
        const res = await request(app).post('/api/v1/auth/login').send(body);
        expect(res.status).toBe(429);
        expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
});

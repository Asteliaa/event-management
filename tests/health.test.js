const request = require('supertest');
const mongoose = require('mongoose');
const { useMemoryDB } = require('./helpers');
const app = require('../server');

describe('GET /health (healthcheck для Docker)', () => {
    describe('с подключенной MongoDB', () => {
        useMemoryDB();

        it.each(['/health', '/api/health'])('200 на %s', async (url) => {
            const res = await request(app).get(url);
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
        });
    });

    it('503 без соединения с MongoDB', async () => {
        expect(mongoose.connection.readyState).not.toBe(1);
        const res = await request(app).get('/health');
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ status: 'error', db: 'down' });
    });
});

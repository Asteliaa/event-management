const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret';

const tokenFor = (payload = {}, options = { expiresIn: '1h' }) =>
    jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email: 'a@b.c', role: 'user', ...payload },
        process.env.JWT_SECRET, options);

const bearer = (user) => `Bearer ${tokenFor({ id: user.id, email: user.email, role: user.role })}`;

// Временная MongoDB в памяти (tests/globalSetup.js): настоящий сервер MongoDB без Atlas и без моков,
// у каждого файла тестов своя база
const useMemoryDB = () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_TEST_URI, {
            dbName: `test_${process.env.JEST_WORKER_ID}_${Date.now()}`,
            // драйвер mongodb 7 загружает модуль os через import(), который не работает в песочнице Jest
            runtimeAdapters: { os: require('os') }
        });
    });
    afterEach(async () => {
        await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    });
    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    });
};

module.exports = { tokenFor, bearer, useMemoryDB };

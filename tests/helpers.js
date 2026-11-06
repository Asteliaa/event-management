const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { User, Event, Category } = require('../src/models');
const { signToken } = require('../src/services/auth.service');

// Временная MongoDB в памяти (tests/globalSetup.js), у каждого файла тестов своя база
const useMemoryDB = () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_TEST_URI, {
            dbName: `test_${process.env.JEST_WORKER_ID}_${Date.now()}`,
            // драйвер mongodb 7 загружает модуль os через import(), который не работает в песочнице Jest
            runtimeAdapters: { os: require('os') }
        });
        await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    });
    afterEach(async () => {
        await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    });
    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    });
};

let counter = 0;
const createUser = async (data = {}) => {
    counter += 1;
    const user = await User.create({
        name: `Пользователь ${counter}`,
        email: `user${counter}@test.local`,
        passwordHash: await bcrypt.hash(data.password || 'secret123', 4),
        ...data
    });
    return Object.assign(user, { auth: `Bearer ${signToken(user)}` });
};

const createAdmin = (data = {}) => createUser({ role: 'admin', ...data });

const inDays = (days) => new Date(Date.now() + days * 864e5);

const createEvent = (data = {}) => Event.create({
    title: 'Тестовое мероприятие',
    type: 'webinar',
    startsAt: inDays(7),
    ...data
});

const createCategory = (data = {}) => Category.create({ name: 'IT', slug: `it-${++counter}`, ...data });

module.exports = { useMemoryDB, createUser, createAdmin, createEvent, createCategory, inDays };

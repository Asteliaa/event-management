const bcrypt = require('bcrypt');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
// globalSetup выполняется в отдельном контексте, поэтому адрес тестовой базы задается и здесь
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { sequelize, User, Event, Category } = require('../src/models');
const { signToken } = require('../src/services/auth.service');

const TABLES = ['notifications', 'favorites', 'messages', 'reminders', 'registrations', 'events', 'categories', 'users'];

// Тестовая база PostgreSQL (tests/globalSetup.js): после каждого теста таблицы очищаются
const useTestDB = () => {
    afterEach(async () => {
        await sequelize.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    });
    afterAll(async () => {
        await sequelize.close();
    });
};

let counter = 0;
const createUser = async (data = {}) => {
    counter += 1;
    const { password, ...rest } = data;
    const user = await User.create({
        name: `Пользователь ${counter}`,
        email: `user${counter}@test.local`,
        passwordHash: await bcrypt.hash(password || 'secret123', 4),
        ...rest
    });
    return Object.assign(user, { auth: `Bearer ${signToken(user)}` });
};

const createAdmin = (data = {}) => createUser({ role: 'admin', ...data });
const createOrganizer = (data = {}) => createUser({ role: 'organizer', ...data });

const inDays = (days) => new Date(Date.now() + days * 864e5);

// Поля как в API: category – id категории, location – вложенный объект
const eventAttributes = ({ category, location, ...data }) => {
    const startsAt = data.startsAt === undefined ? inDays(7) : data.startsAt;
    return {
    title: 'Тестовое мероприятие',
    type: 'webinar',
    // по умолчанию – опубликованное очное мероприятие (минимум, нужный для публикации)
    status: 'published',
    timezone: 'Europe/Minsk',
    startsAt,
    endsAt: startsAt && new Date(startsAt.getTime() + 2 * 3600e3),
    locationCity: 'Минск',
    ...(data.status === 'cancelled' && { cancelledAt: new Date() }),
    ...(category !== undefined && { categoryId: category }),
    ...(location !== undefined && Event.locationToColumns(location)),
    ...data
    };
};

const createEvent = (data = {}) => Event.create(eventAttributes(data));
const createEvents = (list) => Promise.all(list.map(createEvent));

const createCategory = (data = {}) => Category.create({ name: 'IT', slug: `it-${++counter}`, ...data });

// Регистрация напрямую через сервис (для тестов других модулей)
const registerUser = (event, user) => require('../src/services/registration.service').register(event.id, user);

// Заведомо отсутствующий, но корректный id
const missingId = '999999999';

module.exports = { useTestDB, createUser, createAdmin, createOrganizer, registerUser, createEvent, createEvents, createCategory, inDays, missingId };

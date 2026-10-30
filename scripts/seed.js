// Заполнение MongoDB демонстрационными данными: npm run seed
require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const connectDB = require('../db');
const { User, Event } = require('../models');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@events.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin12345';
const USER_PASSWORD = 'user12345';

async function seed() {
    await connectDB();
    await Promise.all([User.deleteMany({}), Event.deleteMany({})]);

    const [admin, anna, ivan] = await User.create([
        { email: ADMIN_EMAIL, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10), role: 'admin' },
        { email: 'anna@events.local', passwordHash: await bcrypt.hash(USER_PASSWORD, 10) },
        { email: 'ivan@events.local', passwordHash: await bcrypt.hash(USER_PASSWORD, 10) }
    ]);

    await Event.create([
        {
            title: 'Конференция разработчиков 2026',
            type: 'conference',
            date: new Date('2026-12-10T10:00:00Z'),
            description: 'Масштабная IT-конференция',
            capacity: 500,
            location: { city: 'Минск', venue: 'Конгресс-холл', online: false },
            tags: ['it', 'backend', 'важный'],
            registrations: [
                { user: anna._id, name: 'Анна Петрова', email: anna.email, tickets: 2 },
                { user: ivan._id, name: 'Иван Сидоров', email: ivan.email, tickets: 1 }
            ]
        },
        {
            title: 'Вебинар: введение в MongoDB и Mongoose',
            type: 'webinar',
            date: new Date('2026-11-20T15:00:00Z'),
            description: 'Документная модель данных на практике',
            capacity: 100,
            location: { online: true },
            tags: ['mongodb', 'nosql'],
            registrations: [
                { user: anna._id, name: 'Анна Петрова', email: anna.email, tickets: 1, status: 'attended' }
            ]
        },
        {
            title: 'Встреча организаторов',
            type: 'meeting',
            date: new Date('2026-11-12T09:00:00Z'),
            description: 'Планирование мероприятий на следующий квартал',
            capacity: 12,
            location: { city: 'Минск', venue: 'Офис, переговорная 3', online: false },
            tags: ['внутреннее'],
            registrations: []
        }
    ]);

    console.log(`Готово: ${await User.countDocuments()} пользователя, ${await Event.countDocuments()} мероприятия`);
    console.log(`Администратор: ${admin.email}`);
}

seed()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());

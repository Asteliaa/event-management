// Заполнение MongoDB демонстрационными данными: npm run seed
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const config = require('../src/config');
const connectDB = require('../src/config/db');
const { User, Category, Event, Registration, Reminder, Message } = require('../src/models');
const { slugify } = require('../src/services/category.service');
const reminderService = require('../src/services/reminder.service');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@events.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin12345';
const USER_PASSWORD = 'user12345';

// Дата относительно текущей: через days дней в hour:00 по Минску (UTC+3)
const at = (days, hour = 10) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hour - 3, 0, 0, 0);
    return d;
};
const plusHours = (date, h) => new Date(date.getTime() + h * 3600e3);

async function seed() {
    await connectDB();
    await Promise.all([User, Category, Event, Registration, Reminder, Message].map((m) => m.deleteMany({})));
    await Promise.all([User, Category, Event, Registration, Reminder, Message].map((m) => m.syncIndexes()));

    const hash = (p) => bcrypt.hash(p, config.bcryptRounds);
    const [admin, anna, ivan, olga] = await User.create([
        { name: 'Администратор', email: ADMIN_EMAIL, passwordHash: await hash(ADMIN_PASSWORD), role: 'admin', city: 'Минск' },
        { name: 'Анна Петрова', email: 'anna@events.local', passwordHash: await hash(USER_PASSWORD), city: 'Минск' },
        { name: 'Иван Сидоров', email: 'ivan@events.local', passwordHash: await hash(USER_PASSWORD), city: 'Гродно' },
        { name: 'Ольга Ковалёва', email: 'olga@events.local', passwordHash: await hash(USER_PASSWORD), city: 'Брест' }
    ]);

    const categoryData = [
        ['IT и разработка', '#6366f1', 'Программирование, архитектура, DevOps'],
        ['Бизнес и стартапы', '#f59e0b', 'Предпринимательство, маркетинг, инвестиции'],
        ['Дизайн', '#ec4899', 'UX/UI, графический и продуктовый дизайн'],
        ['Наука и образование', '#10b981', 'Лекции, исследования, методики обучения'],
        ['Карьера', '#0ea5e9', 'Собеседования, soft skills, профориентация']
    ];
    const [it, biz, design, edu, career] = await Category.create(categoryData.map(([name, color, description]) =>
        ({ name, slug: slugify(name), color, description })));

    const events = await Event.create([
        {
            title: 'Конференция разработчиков DevDay 2026', type: 'conference', category: it._id,
            startsAt: at(12, 10), endsAt: at(12, 18), capacity: 300,
            description: 'Главная IT-конференция года: доклады о backend-разработке, облачных технологиях и искусственном интеллекте. Три параллельных потока, нетворкинг и выставка компаний.',
            location: { city: 'Минск', venue: 'Конгресс-холл, пр. Победителей, 20' }, tags: ['backend', 'cloud', 'ai']
        },
        {
            title: 'Вебинар: React 19 и серверные компоненты', type: 'webinar', category: it._id,
            startsAt: at(3, 19), endsAt: at(3, 21), capacity: 500,
            description: 'Разбираем новые возможности React 19: Actions, useOptimistic, серверные компоненты. Живое программирование и ответы на вопросы.',
            location: { online: true, url: 'https://meet.example.com/react19' }, tags: ['react', 'frontend', 'javascript']
        },
        {
            title: 'MongoDB на практике: схема данных и индексы', type: 'webinar', category: it._id,
            startsAt: at(1, 18), endsAt: at(1, 20), capacity: 200,
            description: 'Как проектировать документы, когда вкладывать, а когда ссылаться, и как ускорить запросы индексами.',
            location: { online: true, url: 'https://meet.example.com/mongo' }, tags: ['mongodb', 'nosql', 'backend']
        },
        {
            title: 'Startup Weekend Минск', type: 'conference', category: biz._id,
            startsAt: at(20, 9), endsAt: at(22, 18), capacity: 120,
            description: '54 часа, чтобы превратить идею в прототип. Команды, менторы, питчи перед инвесторами и призы.',
            location: { city: 'Минск', venue: 'Технопарк, ул. Купревича, 1' }, tags: ['стартап', 'питч', 'инвестиции']
        },
        {
            title: 'Встреча предпринимателей: маркетинг без бюджета', type: 'meeting', category: biz._id,
            startsAt: at(6, 18), endsAt: at(6, 20), capacity: 25,
            description: 'Камерная встреча в формате круглого стола. Делимся кейсами продвижения малого бизнеса.',
            location: { city: 'Гродно', venue: 'Коворкинг «Точка», ул. Советская, 12' }, tags: ['маркетинг', 'малый бизнес']
        },
        {
            title: 'UX-конференция «Интерфейсы будущего»', type: 'conference', category: design._id,
            startsAt: at(28, 10), endsAt: at(28, 17), capacity: 150,
            description: 'Дизайн-системы, исследования пользователей, доступность и прототипирование в Figma.',
            location: { city: 'Минск', venue: 'Арт-пространство «Ок16»' }, tags: ['ux', 'ui', 'figma']
        },
        {
            title: 'Воркшоп по Figma для начинающих', type: 'meeting', category: design._id,
            startsAt: at(9, 15), endsAt: at(9, 18), capacity: 12,
            description: 'Практическое занятие: от вайрфрейма до кликабельного прототипа. Ноутбук обязателен.',
            location: { city: 'Брест', venue: 'Библиотека им. Пушкина, зал 2' }, tags: ['figma', 'прототипирование']
        },
        {
            title: 'Открытая лекция: как работает интернет', type: 'webinar', category: edu._id,
            startsAt: at(4, 17), endsAt: at(4, 18), capacity: 1000,
            description: 'Протоколы TCP/IP, DNS, HTTP и HTTPS простыми словами. Для школьников и студентов.',
            location: { online: true }, tags: ['сети', 'http', 'образование']
        },
        {
            title: 'Научный семинар по машинному обучению', type: 'meeting', category: edu._id,
            startsAt: at(15, 16), endsAt: at(15, 18), capacity: 40,
            description: 'Доклады аспирантов БГУИР о применении нейросетей в обработке сигналов.',
            location: { city: 'Минск', venue: 'БГУИР, корпус 5, ауд. 401' }, tags: ['ml', 'наука']
        },
        {
            title: 'Карьерный день: как пройти собеседование в IT', type: 'webinar', category: career._id,
            startsAt: at(7, 19), endsAt: at(7, 20), capacity: 300,
            description: 'HR и тимлиды рассказывают, что спрашивают на собеседованиях и как составить резюме.',
            location: { online: true, url: 'https://meet.example.com/career' }, tags: ['карьера', 'собеседование']
        },
        {
            title: 'Ярмарка вакансий для студентов', type: 'conference', category: career._id,
            startsAt: at(35, 11), endsAt: at(35, 16),
            description: 'Более 40 компаний, стажировки и первые вакансии. Вход свободный.',
            location: { city: 'Минск', venue: 'Футбольный манеж' }, tags: ['карьера', 'стажировка']
        },
        {
            title: 'Митап JavaScript-разработчиков (прошедший)', type: 'meeting', category: it._id,
            startsAt: at(-10, 18), endsAt: plusHours(at(-10, 18), 3), capacity: 60,
            description: 'Доклады о Node.js, тестировании и производительности фронтенда.',
            location: { city: 'Минск', venue: 'Офис EPAM' }, tags: ['javascript', 'node.js']
        }
    ].map((e) => ({ ...e, organizer: admin._id })));

    // Регистрации с занятыми местами и автоматическими напоминаниями
    const registrations = [
        [anna, events[0], 2], [anna, events[1], 1], [anna, events[2], 1], [anna, events[6], 1],
        [ivan, events[0], 1], [ivan, events[3], 3], [ivan, events[4], 1],
        [olga, events[1], 1], [olga, events[5], 2], [olga, events[6], 1], [olga, events[9], 1]
    ];
    for (const [user, event, tickets] of registrations) {
        await Registration.create({ user: user._id, event: event._id, tickets });
        event.seatsTaken += tickets;
        await event.save();
        await reminderService.createAuto(user._id, event);
    }
    await Registration.create({ user: anna._id, event: events[11]._id, tickets: 1, status: 'attended' });
    events[11].seatsTaken = 1;
    await events[11].save();

    anna.favorites = [events[3]._id, events[5]._id];
    await anna.save();

    await Message.create([
        { event: events[0]._id, user: anna._id, author: anna.name, text: 'Кто-нибудь идет на поток про облака?' },
        { event: events[0]._id, user: ivan._id, author: ivan.name, text: 'Я! Встретимся у входа в 9:45' }
    ]);

    console.log(`Готово: пользователей ${await User.countDocuments()}, категорий ${await Category.countDocuments()}, `
        + `мероприятий ${await Event.countDocuments()}, регистраций ${await Registration.countDocuments()}, `
        + `напоминаний ${await Reminder.countDocuments()}`);
    console.log(`Администратор: ${admin.email}; пользователи: anna@, ivan@, olga@events.local (пароль ${USER_PASSWORD})`);
}

seed()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());

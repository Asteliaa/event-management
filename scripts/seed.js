// Демонстрационные данные EventHub: npm run seed
//
// Все записи вымышленные и помечены как демо: учетные записи в домене demo.eventhub.local,
// в описаниях категорий – пометка «Демо». Реальные персональные данные не используются.
//
// Безопасность: скрипт заполняет только пустую базу. Чтобы пересоздать демо-данные в базе,
// где уже есть записи, нужен явный флаг: npm run seed -- --reset (все таблицы будут очищены).
const bcrypt = require('bcrypt');
const { QueryTypes } = require('sequelize');
const config = require('../src/config');
const { connect, describeTarget } = require('../src/db');
const migrator = require('../src/db/migrator');
const { sequelize, User, Category, Event, Registration, Reminder, Message, Favorite } = require('../src/models');
const { slugify } = require('../src/services/category.service');
const reminderService = require('../src/services/reminder.service');

const DEMO_DOMAIN = 'demo.eventhub.local';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || `admin@${DEMO_DOMAIN}`;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin12345';
const USER_PASSWORD = 'user12345';
const TABLES = ['favorites', 'messages', 'reminders', 'registrations', 'events', 'categories', 'users'];

// Дата относительно текущей: через days дней в hour:00 по UTC+3.
// Это только способ получить правдоподобное время для демо; в БД хранится момент времени (timestamptz)
const at = (days, hour = 10) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hour - 3, 0, 0, 0);
    return d;
};
const plusHours = (date, h) => new Date(date.getTime() + h * 3600e3);

async function ensureEmptyOrReset() {
    const reset = process.argv.includes('--reset');
    const [{ total }] = await sequelize.query(
        `SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM events) + (SELECT count(*) FROM categories) AS total`,
        { type: QueryTypes.SELECT }
    );
    if (Number(total) > 0 && !reset) {
        throw new Error('В базе уже есть данные. Демо-данные загружаются только в пустую базу; '
            + 'для полной очистки и перезаполнения запустите: npm run seed -- --reset');
    }
    if (Number(total) > 0) {
        console.log('Флаг --reset: таблицы очищаются');
        await sequelize.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    }
}

async function seed() {
    console.log(`База данных: ${describeTarget()}`);
    await connect();
    const pending = await migrator.pending();
    if (pending.length) throw new Error('Сначала примените миграции: npm run db:migrate');
    await ensureEmptyOrReset();

    const hash = (p) => bcrypt.hash(p, config.bcryptRounds);
    const admin = await User.create({ name: 'Администратор', email: ADMIN_EMAIL, passwordHash: await hash(ADMIN_PASSWORD), role: 'admin', city: 'Минск' });
    const [organizer, anna, ivan, olga] = await User.bulkCreate([
        { name: 'Мария Организатор', email: `organizer@${DEMO_DOMAIN}`, passwordHash: await hash(USER_PASSWORD), role: 'organizer', city: 'Минск' },
        { name: 'Анна Петрова', email: `anna@${DEMO_DOMAIN}`, passwordHash: await hash(USER_PASSWORD), city: 'Минск' },
        { name: 'Иван Сидоров', email: `ivan@${DEMO_DOMAIN}`, passwordHash: await hash(USER_PASSWORD), city: 'Гродно' },
        { name: 'Ольга Ковалёва', email: `olga@${DEMO_DOMAIN}`, passwordHash: await hash(USER_PASSWORD), city: 'Брест' }
    ], { returning: true });

    const categoryData = [
        ['IT и разработка', '#6366f1', 'Программирование, архитектура, DevOps'],
        ['Бизнес и стартапы', '#f59e0b', 'Предпринимательство, маркетинг, инвестиции'],
        ['Дизайн', '#ec4899', 'UX/UI, графический и продуктовый дизайн'],
        ['Наука и образование', '#10b981', 'Лекции, исследования, методики обучения'],
        ['Карьера', '#0ea5e9', 'Собеседования, soft skills, профориентация']
    ];
    const [it, biz, design, edu, career] = await Category.bulkCreate(categoryData.map(([name, color, description]) =>
        ({ name, slug: slugify(name), color, description: `Демо. ${description}` })), { returning: true });

    const eventData = [
        {
            title: 'Конференция разработчиков DevDay 2026', type: 'conference', category: it,
            startsAt: at(12, 10), endsAt: at(12, 18), capacity: 300,
            description: 'Главная IT-конференция года: доклады о backend-разработке, облачных технологиях и искусственном интеллекте. Три параллельных потока, нетворкинг и выставка компаний.',
            location: { city: 'Минск', venue: 'Конгресс-холл, пр. Победителей, 20' }, tags: ['backend', 'cloud', 'ai']
        },
        {
            title: 'Вебинар: React 19 и серверные компоненты', type: 'webinar', category: it,
            startsAt: at(3, 19), endsAt: at(3, 21), capacity: 500,
            description: 'Разбираем новые возможности React 19: Actions, useOptimistic, серверные компоненты. Живое программирование и ответы на вопросы.',
            location: { online: true, url: 'https://meet.example.com/react19' }, tags: ['react', 'frontend', 'javascript']
        },
        {
            title: 'PostgreSQL на практике: схема данных и индексы', type: 'webinar', category: it,
            startsAt: at(1, 18), endsAt: at(1, 20), capacity: 200,
            description: 'Как проектировать таблицы и связи, где нужны ограничения и транзакции и как ускорить запросы индексами.',
            location: { online: true, url: 'https://meet.example.com/postgres' }, tags: ['postgresql', 'sql', 'backend']
        },
        {
            title: 'Startup Weekend Минск', type: 'conference', category: biz,
            startsAt: at(20, 9), endsAt: at(22, 18), capacity: 120,
            description: '54 часа, чтобы превратить идею в прототип. Команды, менторы, питчи перед инвесторами и призы.',
            location: { city: 'Минск', venue: 'Технопарк, ул. Купревича, 1' }, tags: ['стартап', 'питч', 'инвестиции']
        },
        {
            title: 'Встреча предпринимателей: маркетинг без бюджета', type: 'meeting', category: biz,
            startsAt: at(6, 18), endsAt: at(6, 20), capacity: 25,
            description: 'Камерная встреча в формате круглого стола. Делимся кейсами продвижения малого бизнеса.',
            location: { city: 'Гродно', venue: 'Коворкинг «Точка», ул. Советская, 12' }, tags: ['маркетинг', 'малый бизнес']
        },
        {
            title: 'UX-конференция «Интерфейсы будущего»', type: 'conference', category: design,
            startsAt: at(28, 10), endsAt: at(28, 17), capacity: 150,
            description: 'Дизайн-системы, исследования пользователей, доступность и прототипирование в Figma.',
            location: { city: 'Минск', venue: 'Арт-пространство «Ок16»' }, tags: ['ux', 'ui', 'figma']
        },
        {
            title: 'Воркшоп по Figma для начинающих', type: 'meeting', category: design,
            startsAt: at(9, 15), endsAt: at(9, 18), capacity: 12,
            description: 'Практическое занятие: от вайрфрейма до кликабельного прототипа. Ноутбук обязателен.',
            location: { city: 'Брест', venue: 'Библиотека им. Пушкина, зал 2' }, tags: ['figma', 'прототипирование']
        },
        {
            title: 'Открытая лекция: как работает интернет', type: 'webinar', category: edu,
            startsAt: at(4, 17), endsAt: at(4, 18), capacity: 1000,
            description: 'Протоколы TCP/IP, DNS, HTTP и HTTPS простыми словами. Для школьников и студентов.',
            location: { online: true }, tags: ['сети', 'http', 'образование']
        },
        {
            title: 'Научный семинар по машинному обучению', type: 'meeting', category: edu,
            startsAt: at(15, 16), endsAt: at(15, 18), capacity: 40,
            description: 'Доклады аспирантов о применении нейросетей в обработке сигналов.',
            location: { city: 'Минск', venue: 'Университет, корпус 5, ауд. 401' }, tags: ['ml', 'наука']
        },
        {
            title: 'Карьерный день: как пройти собеседование в IT', type: 'webinar', category: career,
            startsAt: at(7, 19), endsAt: at(7, 20), capacity: 300,
            description: 'HR и тимлиды рассказывают, что спрашивают на собеседованиях и как составить резюме.',
            location: { online: true, url: 'https://meet.example.com/career' }, tags: ['карьера', 'собеседование']
        },
        {
            title: 'Ярмарка вакансий для студентов', type: 'conference', category: career,
            startsAt: at(35, 11), endsAt: at(35, 16),
            description: 'Более 40 компаний, стажировки и первые вакансии. Вход свободный.',
            location: { city: 'Минск', venue: 'Футбольный манеж' }, tags: ['карьера', 'стажировка']
        },
        {
            title: 'Митап JavaScript-разработчиков (прошедший)', type: 'meeting', category: it,
            startsAt: at(-10, 18), endsAt: plusHours(at(-10, 18), 3), capacity: 60,
            description: 'Доклады о Node.js, тестировании и производительности фронтенда.',
            location: { city: 'Минск', venue: 'IT-хаб, ул. Примерная, 1' }, tags: ['javascript', 'node.js']
        }
    ];
    const events = await Event.bulkCreate(eventData.map(({ category, location, ...e }) => ({
        ...e, categoryId: category.id, organizerId: admin.id, ...Event.locationToColumns(location)
    })), { returning: true });
    // часть мероприятий принадлежит демо-организатору (облегченная роль: управляет только своими)
    await Event.update({ organizerId: organizer.id }, { where: { id: events.filter((_, i) => i % 2 === 0).map((e) => e.id) } });

    // Регистрации (одна регистрация – одно место), счетчик мест и автоматические напоминания – в одной транзакции
    const registrations = [
        [anna, events[0]], [anna, events[1]], [anna, events[2]], [anna, events[6]],
        [ivan, events[0]], [ivan, events[3]], [ivan, events[4]],
        [olga, events[1]], [olga, events[5]], [olga, events[6]], [olga, events[9]]
    ];
    await sequelize.transaction(async (transaction) => {
        // история: Иван записывался на events[2], отменил участие, а затем записался снова (новая регистрация)
        await Registration.create({
            userId: ivan.id, eventId: events[2].id, status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'user'
        }, { transaction });
        registrations.push([ivan, events[2]]);
        for (const [user, event] of registrations) {
            const registration = await Registration.create({ userId: user.id, eventId: event.id }, { transaction });
            await reminderService.createAuto(registration, event, transaction);
        }
        // посещенное прошедшее мероприятие
        await Registration.create({ userId: anna.id, eventId: events[11].id, tickets: 1, status: 'attended' }, { transaction });
        // счетчик мест = сумма билетов активных регистраций
        await sequelize.query(
            `UPDATE events e SET seats_taken = r.seats
             FROM (SELECT event_id, count(*)::int AS seats FROM registrations
                   WHERE status <> 'cancelled' GROUP BY event_id) r
             WHERE e.id = r.event_id`,
            { transaction }
        );
    });

    await Favorite.bulkCreate([{ userId: anna.id, eventId: events[3].id }, { userId: anna.id, eventId: events[5].id }]);

    await Message.bulkCreate([
        { eventId: events[0].id, userId: anna.id, author: anna.name, text: 'Кто-нибудь идет на поток про облака?' },
        { eventId: events[0].id, userId: ivan.id, author: ivan.name, text: 'Я! Встретимся у входа в 9:45' }
    ]);

    console.log(`Готово (демо-данные): пользователей ${await User.count()}, категорий ${await Category.count()}, `
        + `мероприятий ${await Event.count()}, регистраций ${await Registration.count()}, `
        + `напоминаний ${await Reminder.count()}`);
    console.log(`Администратор: ${admin.email}; организатор: organizer@${DEMO_DOMAIN}; `
        + `пользователи: anna@, ivan@, olga@${DEMO_DOMAIN} (пароль ${USER_PASSWORD})`);
}

seed()
    .catch((err) => {
        console.error('Ошибка заполнения:', err.message);
        process.exitCode = 1;
    })
    .finally(() => sequelize.close());

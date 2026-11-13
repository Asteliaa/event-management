// Миграции этапа Б на данных этапа А: схема откатывается до состояния этапа А,
// заполняется данными в прежнем формате (несколько билетов в регистрации, свои напоминания без регистрации),
// затем миграции применяются снова и проверяется преобразование
const { QueryTypes } = require('sequelize');
const { useTestDB } = require('./helpers');
const { sequelize } = require('../src/models');
const migrator = require('../src/db/migrator');

// до useTestDB: хуки afterAll выполняются в порядке объявления, соединение закрывается последним
afterAll(async () => {
    // на случай ошибки посередине: схема возвращается к последней версии для остальных тестов
    await migrator.up();
});
useTestDB();

const B1 = '20261112000001-organizer-and-single-seat-registrations.js';
const select = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });
const q = (sql) => sequelize.query(sql);

const seedStageA = async () => {
    await q(`INSERT INTO users (name, email, password_hash) VALUES
        ('Анна', 'anna@demo.eventhub.local', 'x'), ('Иван', 'ivan@demo.eventhub.local', 'x')`);
    await q(`INSERT INTO users (name, email, password_hash, blocked) VALUES ('Петр', 'petr@demo.eventhub.local', 'x', true)`);
    await q(`INSERT INTO events (title, type, starts_at, capacity, seats_taken) VALUES
        ('Конференция', 'conference', now() + interval '10 days', 10, 4),
        ('Вебинар', 'webinar', now() + interval '5 days', NULL, 0)`);
    // Анна: 3 билета на конференцию; Иван: 1 билет, потом отменил (места освобождены)
    await q(`INSERT INTO registrations (event_id, user_id, tickets, status) VALUES
        (1, 1, 3, 'registered'), (1, 2, 1, 'registered'), (2, 2, 2, 'cancelled')`);
    await q(`INSERT INTO reminders (user_id, event_id, offset_minutes, remind_at, kind, status) VALUES
        (1, 1, 1440, now() + interval '9 days', 'auto', 'pending'),
        (2, 2, 60, now() + interval '5 days' - interval '1 hour', 'custom', 'pending'),
        (2, 1, 60, now() - interval '1 day', 'custom', 'sent')`);
    await q(`UPDATE reminders SET sent_at = now() - interval '1 day', read_at = now() WHERE status = 'sent'`);
};

describe('Миграции этапа Б на данных этапа А', () => {
    it('Б1–Б3: мультибилетные регистрации: одна регистрация – одно место, число билетов сохранено, откат восстанавливает', async () => {
        await migrator.down({ to: B1 });
        await seedStageA();
        await migrator.up();

        expect(await select('SELECT id::int, legacy_tickets, status, cancelled_at IS NOT NULL AS cancelled FROM registrations ORDER BY id'))
            .toEqual([
                { id: 1, legacy_tickets: 3, status: 'registered', cancelled: false },
                { id: 2, legacy_tickets: 1, status: 'registered', cancelled: false },
                { id: 3, legacy_tickets: 2, status: 'cancelled', cancelled: true }
            ]);
        // счетчик: было 4 билета, стало 2 активные регистрации
        expect(await select('SELECT id::int, seats_taken FROM events ORDER BY id'))
            .toEqual([{ id: 1, seats_taken: 2 }, { id: 2, seats_taken: 0 }]);
        // напоминания привязаны к активной регистрации; свое напоминание без регистрации отменено, отправленное сохранено
        expect(await select(`SELECT user_id::int, event_id::int, registration_id::int, status, cancel_reason
                             FROM reminders ORDER BY id`))
            .toEqual([
                { user_id: 1, event_id: 1, registration_id: 1, status: 'pending', cancel_reason: null },
                { user_id: 2, event_id: 2, registration_id: null, status: 'cancelled', cancel_reason: 'no_registration' },
                { user_id: 2, event_id: 1, registration_id: 2, status: 'sent', cancel_reason: null }
            ]);

        // Б2: пояс существующих мероприятий, отметка публикации, история отправленных напоминаний
        expect(await select(`SELECT status, timezone, schedule_version, published_at IS NOT NULL AS published FROM events ORDER BY id`))
            .toEqual([
                { status: 'published', timezone: 'Europe/Minsk', schedule_version: 1, published: true },
                { status: 'published', timezone: 'Europe/Minsk', schedule_version: 1, published: true }
            ]);
        expect(await select(`SELECT user_id::int, type, reminder_id::int, dedup_key, read_at IS NOT NULL AS read FROM notifications`))
            .toEqual([{ user_id: 2, type: 'reminder', reminder_id: 3, dedup_key: 'reminder:3:v1', read: true }]);

        // Б3: все существующие аккаунты активны, блокировка сохранена с отметкой времени
        expect(await select(`SELECT status, blocked, blocked_at IS NOT NULL AS blocked_at, token_version FROM users ORDER BY id`))
            .toEqual([
                { status: 'active', blocked: false, blocked_at: false, token_version: 0 },
                { status: 'active', blocked: false, blocked_at: false, token_version: 0 },
                { status: 'active', blocked: true, blocked_at: true, token_version: 0 }
            ]);

        // откат возвращает прежний формат без потерь
        // (обезличенный аккаунт получает служебный адрес, так как до Б3 email обязателен)
        await q(`UPDATE users SET status = 'deleted', deleted_at = now(), email = NULL, name = 'Удаленный пользователь' WHERE id = 3`);
        await migrator.down({ to: B1 });
        expect(await select('SELECT tickets FROM registrations ORDER BY id')).toEqual([{ tickets: 3 }, { tickets: 1 }, { tickets: 2 }]);
        expect(await select('SELECT seats_taken FROM events ORDER BY id')).toEqual([{ seats_taken: 4 }, { seats_taken: 0 }]);
        expect(await select(`SELECT status, read_at IS NOT NULL AS read FROM reminders ORDER BY id`))
            .toEqual([{ status: 'pending', read: false }, { status: 'pending', read: false }, { status: 'sent', read: true }]);
        expect(await select('SELECT email FROM users WHERE id = 3')).toEqual([{ email: 'deleted-3@invalid.local' }]);
        await migrator.up();
    });
});

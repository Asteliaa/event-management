const { useMemoryDB } = require('./helpers');
const { User, Event } = require('../models');
const connectDB = require('../db');

useMemoryDB();

describe('модель User', () => {
    it('роль по умолчанию user, email в нижнем регистре', () => {
        const user = new User({ email: ' A@B.C ', passwordHash: 'h' });
        expect(user.role).toBe('user');
        expect(user.email).toBe('a@b.c');
    });

    it('требует email и passwordHash, роль только user/admin', async () => {
        await expect(new User({}).validate()).rejects.toThrow();
        await expect(new User({ email: 'a@b.c' }).validate()).rejects.toThrow();
        await expect(new User({ email: 'a@b.c', passwordHash: 'h', role: 'root' }).validate()).rejects.toThrow();
    });

    it('уникальный индекс на email', async () => {
        await User.init();
        await User.create({ email: 'a@b.c', passwordHash: 'h' });
        await expect(User.create({ email: 'a@b.c', passwordHash: 'h' })).rejects.toThrow(/duplicate key/);
    });
});

describe('модель Event', () => {
    const base = { title: 'T', type: 'webinar', date: '2026-11-05' };

    it('требует title, type, date и проверяет тип', async () => {
        await expect(new Event({}).validate()).rejects.toThrow();
        await expect(new Event({ ...base, type: 'party' }).validate()).rejects.toThrow();
        await expect(new Event(base).validate()).resolves.toBeUndefined();
    });

    it('валидирует вложенные регистрации', async () => {
        await expect(new Event({ ...base, registrations: [{ name: 'A' }] }).validate()).rejects.toThrow(/email/);
        await expect(new Event({ ...base, registrations: [{ name: 'A', email: 'a@b.c', tickets: 0 }] }).validate()).rejects.toThrow();
    });

    it('виртуальные поля и метод hasSeats учитывают только активные регистрации', () => {
        const event = new Event({
            ...base,
            capacity: 4,
            registrations: [
                { name: 'A', email: 'a@b.c', tickets: 2 },
                { name: 'B', email: 'b@b.c', tickets: 5, status: 'cancelled' }
            ]
        });
        expect(event.seatsTaken).toBe(2);
        expect(event.seatsLeft).toBe(2);
        expect(event.hasSeats(2)).toBe(true);
        expect(event.hasSeats(3)).toBe(false);
    });

    it('статический метод findUpcomingByTag', async () => {
        await Event.create([
            { ...base, title: 'Прошло', date: '2020-01-01', tags: ['it'] },
            { ...base, title: 'Позже', date: '2099-02-01', tags: ['it'] },
            { ...base, title: 'Скоро', date: '2099-01-01', tags: ['IT'] },
            { ...base, title: 'Другое', date: '2099-01-01', tags: ['art'] }
        ]);
        const events = await Event.findUpcomingByTag('It');
        expect(events.map((e) => e.title)).toEqual(['Скоро', 'Позже']);
    });

    it('индексы по date, tags и registrations.email', () => {
        const fields = Event.schema.indexes().map(([f]) => Object.keys(f)[0]);
        expect(fields).toEqual(expect.arrayContaining(['date', 'tags', 'registrations.email']));
    });
});

describe('подключение db.js', () => {
    it('ошибка без MONGO_URI', async () => {
        await expect(connectDB('')).rejects.toThrow(/MONGO_URI/);
    });
});

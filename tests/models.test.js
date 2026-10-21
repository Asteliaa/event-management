const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('postgres://user:pass@localhost:5432/test', { logging: false });
const User = require('../models/user')(sequelize, DataTypes);
const Event = require('../models/event')(sequelize, DataTypes);

describe('модель User', () => {
    it('роль по умолчанию user', () => {
        expect(User.build({ email: 'a@b.c', passwordHash: 'h' }).role).toBe('user');
    });

    it('валидна с корректными данными', async () => {
        await expect(User.build({ email: 'a@b.c', passwordHash: 'h', role: 'admin' }).validate()).resolves.toBeDefined();
    });

    it('требует email и passwordHash', async () => {
        await expect(User.build({}).validate()).rejects.toThrow();
        await expect(User.build({ email: 'a@b.c' }).validate()).rejects.toThrow();
    });

    it('отклоняет неизвестную роль', async () => {
        await expect(User.build({ email: 'a@b.c', passwordHash: 'h', role: 'root' }).validate()).rejects.toThrow();
    });

    it('email уникален, поля не допускают null', () => {
        expect(User.rawAttributes.email.unique).toBe(true);
        expect(User.rawAttributes.email.allowNull).toBe(false);
        expect(User.rawAttributes.passwordHash.allowNull).toBe(false);
    });

    it('associate не падает', () => {
        expect(() => User.associate({})).not.toThrow();
    });
});

describe('модель Event', () => {
    it('содержит ожидаемые поля', () => {
        expect(Object.keys(Event.rawAttributes)).toEqual(expect.arrayContaining(['title', 'type', 'date', 'description']));
    });

    it('associate не падает', () => {
        expect(() => Event.associate({})).not.toThrow();
    });
});

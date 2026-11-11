const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const { compact, ref } = require('./serialize');

const REGISTRATION_STATUSES = ['registered', 'attended', 'cancelled'];

// Регистрация пользователя на мероприятие (связь User — Event с атрибутами).
// Пара (event_id, user_id) уникальна: повторная запись после отмены реактивирует ту же строку
class Registration extends Model {
    toJSON() {
        const v = this.get({ plain: false });
        return compact({
            id: String(this.id),
            event: ref(this, 'event', 'eventId'),
            user: ref(this, 'user', 'userId'),
            tickets: v.tickets,
            status: v.status,
            comment: v.comment,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt
        });
    }
}

Registration.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    eventId: { type: DataTypes.BIGINT, allowNull: false },
    userId: { type: DataTypes.BIGINT, allowNull: false },
    tickets: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1, validate: { min: 1, max: 10 } },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'registered', validate: { isIn: [REGISTRATION_STATUSES] } },
    comment: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' }
}, { sequelize, modelName: 'Registration', tableName: 'registrations' });

Registration.STATUSES = REGISTRATION_STATUSES;

module.exports = Registration;

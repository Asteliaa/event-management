const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const { compact, ref } = require('./serialize');

// Посещение хранится отдельно (attended), статус – только активна или отменена
const REGISTRATION_STATUSES = ['registered', 'cancelled'];

// Регистрация пользователя на мероприятие (связь User — Event с атрибутами).
// Одна регистрация – одно место. Активной (не cancelled) может быть только одна регистрация пары
// (event_id, user_id) – это гарантирует частичный уникальный индекс; повторная запись после отмены
// создает новую строку, отмененные остаются в истории
const CANCELLED_BY = ['user', 'organizer', 'admin', 'system'];
class Registration extends Model {
    toJSON() {
        const v = this.get({ plain: false });
        return compact({
            id: String(this.id),
            event: ref(this, 'event', 'eventId'),
            user: ref(this, 'user', 'userId'),
            status: v.status,
            comment: v.comment,
            // число билетов регистрации, созданной до перехода на модель «одно место» (только для истории)
            legacyTickets: v.legacyTickets,
            cancelledAt: v.cancelledAt,
            cancelledBy: v.cancelledBy,
            cancelReason: v.cancelReason,
            attended: v.attended,
            attendanceMarkedAt: v.attendanceMarkedAt,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt
        });
    }
}

Registration.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    eventId: { type: DataTypes.BIGINT, allowNull: false },
    userId: { type: DataTypes.BIGINT, allowNull: false },
    legacyTickets: { type: DataTypes.SMALLINT },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'registered', validate: { isIn: [REGISTRATION_STATUSES] } },
    comment: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
    cancelledAt: { type: DataTypes.DATE },
    cancelledBy: { type: DataTypes.TEXT, validate: { isIn: [CANCELLED_BY] } },
    cancelReason: { type: DataTypes.STRING(500) },
    attended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    attendanceMarkedAt: { type: DataTypes.DATE },
    attendanceMarkedBy: { type: DataTypes.BIGINT }
}, { sequelize, modelName: 'Registration', tableName: 'registrations' });

Registration.STATUSES = REGISTRATION_STATUSES;
Registration.CANCELLED_BY = CANCELLED_BY;

module.exports = Registration;

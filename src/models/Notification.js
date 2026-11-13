const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const { compact, ref } = require('./serialize');

// Уведомление пользователя: история с отметкой о прочтении. Создается в той же транзакции,
// что и событие-причина (отправка напоминания, перенос, отмена); Socket.IO лишь ускоряет доставку.
// payload содержит только идентификаторы и неперсональные значения – без имен, email и ссылки подключения
const TYPES = ['reminder', 'event_rescheduled', 'event_location_changed', 'event_cancelled', 'registration_cancelled'];

class Notification extends Model {
    toJSON() {
        const v = this.get({ plain: false });
        return compact({
            id: String(this.id),
            type: v.type,
            event: ref(this, 'event', 'eventId'),
            registration: v.registrationId === null || v.registrationId === undefined ? undefined : String(v.registrationId),
            reminder: v.reminderId === null || v.reminderId === undefined ? undefined : String(v.reminderId),
            payload: v.payload,
            readAt: v.readAt,
            createdAt: v.createdAt
        });
    }
}

Notification.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.BIGINT, allowNull: false },
    type: { type: DataTypes.TEXT, allowNull: false, validate: { isIn: [TYPES] } },
    eventId: { type: DataTypes.BIGINT },
    registrationId: { type: DataTypes.BIGINT },
    reminderId: { type: DataTypes.BIGINT },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    dedupKey: { type: DataTypes.TEXT, allowNull: false },
    readAt: { type: DataTypes.DATE }
}, { sequelize, modelName: 'Notification', tableName: 'notifications', updatedAt: false });

Notification.TYPES = TYPES;

module.exports = Notification;

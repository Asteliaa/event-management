const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const { compact, ref } = require('./serialize');

// Напоминание о мероприятии. remindAt = event.startsAt − offsetMinutes.
// Планировщик (jobs/reminderScheduler.js) находит наступившие напоминания со статусом pending,
// переводит их в sent и отправляет пользователю через Socket.IO
class Reminder extends Model {
    toJSON() {
        const v = this.get({ plain: false });
        return compact({
            id: String(this.id),
            user: ref(this, 'user', 'userId'),
            event: ref(this, 'event', 'eventId'),
            offsetMinutes: v.offsetMinutes,
            remindAt: v.remindAt,
            kind: v.kind,
            status: v.status,
            sentAt: v.sentAt,
            readAt: v.readAt,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt
        });
    }
}

Reminder.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.BIGINT, allowNull: false },
    eventId: { type: DataTypes.BIGINT, allowNull: false },
    offsetMinutes: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0, max: 60 * 24 * 30 } },
    remindAt: { type: DataTypes.DATE, allowNull: false },
    // auto – создано при регистрации, custom – добавлено пользователем
    kind: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'custom', validate: { isIn: [['auto', 'custom']] } },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending', validate: { isIn: [['pending', 'sent']] } },
    sentAt: { type: DataTypes.DATE },
    readAt: { type: DataTypes.DATE }
}, { sequelize, modelName: 'Reminder', tableName: 'reminders' });

module.exports = Reminder;

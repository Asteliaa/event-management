const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const { compact } = require('./serialize');

const MAX_LENGTH = 500;

// Сообщение в чате мероприятия (история комнаты event:<id>)
class Message extends Model {
    toJSON() {
        const v = this.get({ plain: false });
        return compact({
            id: String(this.id),
            event: v.eventId === null ? undefined : String(v.eventId),
            user: v.userId === null ? undefined : String(v.userId),
            // имя копируется в сообщение, чтобы история не зависела от профиля и удаления пользователя
            author: v.author,
            text: v.text,
            deleted: v.deletedAt ? true : undefined,
            createdAt: v.createdAt
        });
    }

    // Последние limit сообщений мероприятия, от старых к новым
    static async history(eventId, limit = 50) {
        const last = await this.findAll({
            where: { eventId },
            order: [['createdAt', 'DESC'], ['id', 'DESC']],
            limit
        });
        return last.reverse();
    }
}

Message.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    eventId: { type: DataTypes.BIGINT, allowNull: false },
    userId: { type: DataTypes.BIGINT },
    author: { type: DataTypes.STRING(80), allowNull: false },
    text: { type: DataTypes.STRING(MAX_LENGTH), allowNull: false, validate: { len: [1, MAX_LENGTH] } },
    // сообщение удаленного пользователя: автор и текст заменены при обезличивании
    deletedAt: { type: DataTypes.DATE }
}, { sequelize, modelName: 'Message', tableName: 'messages', updatedAt: false });

Message.MAX_LENGTH = MAX_LENGTH;

module.exports = Message;

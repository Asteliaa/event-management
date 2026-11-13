const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const { compact } = require('./serialize');

// user – участник, organizer – облегченный организатор (роль выдает администратор), admin – администратор
const ROLES = ['user', 'organizer', 'admin'];

const STATUSES = ['active', 'deactivated', 'deleted'];
const DELETED_NAME = 'Удаленный пользователь';

class User extends Model {
    toJSON() {
        // хеш пароля и версия токенов наружу не выдаются
        const { passwordHash, tokenVersion, ...rest } = this.get({ plain: true });
        return compact(rest);
    }

    // Может ли пользователь входить и работать: не заблокирован, не деактивирован и не удален
    get canSignIn() {
        return !this.blocked && this.status === 'active';
    }
}

User.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(80), allowNull: false, set(v) { this.setDataValue('name', typeof v === 'string' ? v.trim() : v); } },
    // у удаленного (обезличенного) пользователя email очищается
    email: {
        type: DataTypes.STRING(254),
        unique: true,
        set(v) { this.setDataValue('email', typeof v === 'string' ? v.trim().toLowerCase() : v); }
    },
    passwordHash: { type: DataTypes.TEXT, allowNull: false },
    role: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'user', validate: { isIn: [ROLES] } },
    city: { type: DataTypes.STRING(80) },
    // заблокированный пользователь не может войти и выполнять запросы
    blocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    blockedAt: { type: DataTypes.DATE },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'active', validate: { isIn: [STATUSES] } },
    deactivatedAt: { type: DataTypes.DATE },
    deactivatedBy: { type: DataTypes.TEXT },
    deletedAt: { type: DataTypes.DATE },
    // увеличивается при блокировке, деактивации, удалении, смене пароля и роли: старые JWT перестают действовать
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    // хеш пароля не загружается без явного запроса (scope withPassword)
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } }
});

User.ROLES = ROLES;
User.STATUSES = STATUSES;
User.DELETED_NAME = DELETED_NAME;

module.exports = User;

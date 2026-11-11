const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const { compact } = require('./serialize');

const ROLES = ['user', 'admin'];

class User extends Model {
    toJSON() {
        const { passwordHash, ...rest } = this.get({ plain: true });
        return compact(rest);
    }
}

User.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(80), allowNull: false, set(v) { this.setDataValue('name', typeof v === 'string' ? v.trim() : v); } },
    email: {
        type: DataTypes.STRING(254),
        allowNull: false,
        unique: true,
        set(v) { this.setDataValue('email', typeof v === 'string' ? v.trim().toLowerCase() : v); }
    },
    passwordHash: { type: DataTypes.TEXT, allowNull: false },
    role: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'user', validate: { isIn: [ROLES] } },
    city: { type: DataTypes.STRING(80) },
    // заблокированный пользователь не может войти и выполнять запросы
    blocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    // хеш пароля не загружается без явного запроса (scope withPassword)
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } }
});

User.ROLES = ROLES;

module.exports = User;

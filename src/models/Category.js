const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const { compact } = require('./serialize');

// Категория (тематика) мероприятия: IT, Бизнес, Образование и т. д.
class Category extends Model {
    toJSON() {
        return compact(this.get({ plain: true }));
    }
}

Category.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    color: { type: DataTypes.CHAR(7), allowNull: false, defaultValue: '#6366f1', validate: { is: /^#[0-9a-fA-F]{6}$/ } },
    description: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' }
}, { sequelize, modelName: 'Category', tableName: 'categories' });

module.exports = Category;

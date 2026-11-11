const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');

// Избранное: связь многие-ко-многим User — Event (в MongoDB – массив users.favorites)
class Favorite extends Model {}

Favorite.init({
    userId: { type: DataTypes.BIGINT, primaryKey: true },
    eventId: { type: DataTypes.BIGINT, primaryKey: true }
}, { sequelize, modelName: 'Favorite', tableName: 'favorites', updatedAt: false });

module.exports = Favorite;

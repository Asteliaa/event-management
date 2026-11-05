'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Event extends Model {
    static associate() {}
  }
  Event.init({
    title: DataTypes.STRING,
    type: DataTypes.STRING,
    date: DataTypes.DATE,
    description: DataTypes.STRING,
    capacity: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Event',
  });
  return Event;
};
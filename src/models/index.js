const { sequelize } = require('../db');
const User = require('./User');
const Category = require('./Category');
const Event = require('./Event');
const Registration = require('./Registration');
const Reminder = require('./Reminder');
const Message = require('./Message');
const Favorite = require('./Favorite');
const Notification = require('./Notification');

// Связи между таблицами (внешние ключи созданы миграцией, здесь – только для include в запросах)
Event.belongsTo(Category, { as: 'category', foreignKey: 'categoryId' });
Event.belongsTo(User, { as: 'organizer', foreignKey: 'organizerId' });
Category.hasMany(Event, { as: 'events', foreignKey: 'categoryId' });

Registration.belongsTo(Event, { as: 'event', foreignKey: 'eventId' });
Registration.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Event.hasMany(Registration, { as: 'registrations', foreignKey: 'eventId' });
User.hasMany(Registration, { as: 'registrations', foreignKey: 'userId' });

Reminder.belongsTo(Event, { as: 'event', foreignKey: 'eventId' });
Reminder.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Reminder.belongsTo(Registration, { as: 'registration', foreignKey: 'registrationId' });
Registration.hasMany(Reminder, { as: 'reminders', foreignKey: 'registrationId' });

Message.belongsTo(Event, { as: 'event', foreignKey: 'eventId' });
Message.belongsTo(User, { as: 'user', foreignKey: 'userId' });

User.belongsToMany(Event, { through: Favorite, as: 'favorites', foreignKey: 'userId', otherKey: 'eventId' });
Event.belongsToMany(User, { through: Favorite, as: 'favoritedBy', foreignKey: 'eventId', otherKey: 'userId' });

Notification.belongsTo(Event, { as: 'event', foreignKey: 'eventId' });
Notification.belongsTo(User, { as: 'user', foreignKey: 'userId' });

module.exports = { sequelize, User, Category, Event, Registration, Reminder, Message, Favorite, Notification };

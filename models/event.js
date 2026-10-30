const mongoose = require('mongoose');
const toJSON = require('./toJSON');

const EVENT_TYPES = ['conference', 'webinar', 'meeting'];

// Вложенный документ: регистрация участника хранится внутри мероприятия,
// а не в отдельной таблице, как было бы в PostgreSQL
const registrationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    tickets: { type: Number, min: 1, default: 1 },
    status: { type: String, enum: ['registered', 'attended', 'cancelled'], default: 'registered' },
    registeredAt: { type: Date, default: Date.now }
}, { toJSON });

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: EVENT_TYPES },
    date: { type: Date, required: true },
    description: { type: String, default: '' },
    capacity: { type: Number, min: 1 },
    // Вложенный объект (поддокумент без собственного _id)
    location: {
        city: { type: String, trim: true },
        venue: { type: String, trim: true },
        online: { type: Boolean, default: false }
    },
    tags: [{ type: String, lowercase: true, trim: true }],
    registrations: [registrationSchema]
}, { timestamps: true, toJSON });

eventSchema.index({ date: 1 });
eventSchema.index({ tags: 1 });
eventSchema.index({ 'registrations.email': 1 });

// Виртуальные поля: занятые и свободные места (не хранятся в БД)
eventSchema.virtual('seatsTaken').get(function () {
    return (this.registrations || [])
        .filter((r) => r.status !== 'cancelled')
        .reduce((sum, r) => sum + r.tickets, 0);
});

eventSchema.virtual('seatsLeft').get(function () {
    return this.capacity ? Math.max(this.capacity - this.seatsTaken, 0) : null;
});

// Метод экземпляра: хватит ли мест на count билетов
eventSchema.methods.hasSeats = function (count = 1) {
    return !this.capacity || this.seatsTaken + count <= this.capacity;
};

// Статический метод модели: ближайшие мероприятия с тегом
eventSchema.statics.findUpcomingByTag = function (tag) {
    return this.find({ tags: tag.toLowerCase(), date: { $gte: new Date() } }).sort({ date: 1 });
};

const Event = mongoose.model('Event', eventSchema);
Event.EVENT_TYPES = EVENT_TYPES;

module.exports = Event;

const mongoose = require('mongoose');
const toJSON = require('./toJSON');

const EVENT_TYPES = ['conference', 'webinar', 'meeting'];
const EVENT_STATUSES = ['published', 'cancelled'];

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 5000 },
    type: { type: String, required: true, enum: EVENT_TYPES },
    status: { type: String, enum: EVENT_STATUSES, default: 'published' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date },
    coverUrl: { type: String, trim: true, default: '' },
    // capacity не задан – мест без ограничений
    capacity: { type: Number, min: 1 },
    // счетчик занятых мест меняется атомарно ($inc) при регистрации и отмене,
    // поэтому два одновременных запроса не превысят вместимость
    seatsTaken: { type: Number, default: 0, min: 0 },
    // вложенный объект (поддокумент без собственного _id)
    location: {
        city: { type: String, trim: true },
        venue: { type: String, trim: true },
        online: { type: Boolean, default: false },
        url: { type: String, trim: true }
    },
    tags: [{ type: String, lowercase: true, trim: true }]
}, { timestamps: true, toJSON });

eventSchema.index({ startsAt: 1 });
eventSchema.index({ category: 1, startsAt: 1 });
eventSchema.index({ tags: 1 });
eventSchema.index({ title: 'text', description: 'text' });

eventSchema.virtual('seatsLeft').get(function () {
    return this.capacity ? Math.max(this.capacity - this.seatsTaken, 0) : null;
});

eventSchema.virtual('isPast').get(function () {
    return this.startsAt < new Date();
});

const Event = mongoose.model('Event', eventSchema);
Event.EVENT_TYPES = EVENT_TYPES;
Event.EVENT_STATUSES = EVENT_STATUSES;

module.exports = Event;

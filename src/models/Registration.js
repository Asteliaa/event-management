const mongoose = require('mongoose');
const toJSON = require('./toJSON');

const REGISTRATION_STATUSES = ['registered', 'attended', 'cancelled'];

// Регистрация пользователя на мероприятие (связь User — Event с атрибутами)
const registrationSchema = new mongoose.Schema({
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tickets: { type: Number, min: 1, max: 10, default: 1 },
    status: { type: String, enum: REGISTRATION_STATUSES, default: 'registered' },
    comment: { type: String, default: '', maxlength: 300 }
}, { timestamps: true, toJSON });

// Один пользователь – одна регистрация на мероприятие
registrationSchema.index({ event: 1, user: 1 }, { unique: true });
registrationSchema.index({ user: 1, createdAt: -1 });

const Registration = mongoose.model('Registration', registrationSchema);
Registration.STATUSES = REGISTRATION_STATUSES;

module.exports = Registration;

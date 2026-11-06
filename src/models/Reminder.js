const mongoose = require('mongoose');
const toJSON = require('./toJSON');

// Напоминание о мероприятии. remindAt = event.startsAt − offsetMinutes.
// Планировщик (jobs/reminderScheduler.js) находит наступившие напоминания со статусом pending,
// переводит их в sent и отправляет пользователю через Socket.IO
const reminderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    offsetMinutes: { type: Number, required: true, min: 0, max: 60 * 24 * 30 },
    remindAt: { type: Date, required: true },
    // auto – создано при регистрации, custom – добавлено пользователем
    kind: { type: String, enum: ['auto', 'custom'], default: 'custom' },
    status: { type: String, enum: ['pending', 'sent'], default: 'pending' },
    sentAt: { type: Date },
    readAt: { type: Date }
}, { timestamps: true, toJSON });

reminderSchema.index({ status: 1, remindAt: 1 });
reminderSchema.index({ user: 1, event: 1, offsetMinutes: 1 }, { unique: true });

module.exports = mongoose.model('Reminder', reminderSchema);

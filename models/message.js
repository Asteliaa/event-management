const mongoose = require('mongoose');
const toJSON = require('./toJSON');

const MAX_LENGTH = 500;

// Сообщение в чате мероприятия (история комнаты event:<id>)
const messageSchema = new mongoose.Schema({
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // email копируется в сообщение, чтобы при загрузке истории не делать populate
    email: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: MAX_LENGTH }
}, { timestamps: { createdAt: true, updatedAt: false }, toJSON });

// История комнаты читается по мероприятию в порядке времени
messageSchema.index({ event: 1, createdAt: -1 });

// Последние limit сообщений мероприятия, от старых к новым
messageSchema.statics.history = async function (eventId, limit = 50) {
    const last = await this.find({ event: eventId }).sort({ createdAt: -1, _id: -1 }).limit(limit);
    return last.reverse();
};

const Message = mongoose.model('Message', messageSchema);
Message.MAX_LENGTH = MAX_LENGTH;

module.exports = Message;

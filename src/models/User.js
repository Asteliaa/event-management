const mongoose = require('mongoose');
const toJSON = require('./toJSON');

const ROLES = ['user', 'admin'];

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'user' },
    city: { type: String, trim: true, maxlength: 80 },
    // заблокированный пользователь не может войти и выполнять запросы
    blocked: { type: Boolean, default: false },
    // избранные мероприятия (связь многие-ко-многим через массив ссылок)
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }]
}, {
    timestamps: true,
    toJSON: {
        ...toJSON,
        transform: (doc, ret) => {
            toJSON.transform(doc, ret);
            delete ret.passwordHash;
            return ret;
        }
    }
});

const User = mongoose.model('User', userSchema);
User.ROLES = ROLES;

module.exports = User;

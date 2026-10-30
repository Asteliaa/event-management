const mongoose = require('mongoose');
const toJSON = require('./toJSON');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,          // уникальный индекс в коллекции users
        lowercase: true,
        trim: true
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true, toJSON });

// Каскадное удаление: вместе с пользователем удаляются его регистрации на мероприятия
userSchema.post('findOneAndDelete', async (user) => {
    if (user) {
        await mongoose.model('Event').updateMany(
            { 'registrations.user': user._id },
            { $pull: { registrations: { user: user._id } } }
        );
    }
});

module.exports = mongoose.model('User', userSchema);

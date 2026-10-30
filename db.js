const mongoose = require('mongoose');

// Подключение к MongoDB (Atlas или локальная установка), строка берется из .env
const connectDB = async (uri = process.env.MONGO_URI) => {
    if (!uri) {
        throw new Error('Не задана переменная окружения MONGO_URI');
    }
    await mongoose.connect(uri);
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return mongoose.connection;
};

module.exports = connectDB;

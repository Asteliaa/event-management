const mongoose = require('mongoose');
const config = require('./index');

// Подключение к MongoDB (Atlas, локальная установка или контейнер Docker)
const connectDB = async (uri = config.mongoUri) => {
    if (!uri) {
        throw new Error('Не задана переменная окружения MONGO_URI');
    }
    await mongoose.connect(uri);
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return mongoose.connection;
};

module.exports = connectDB;

const { MongoMemoryServer } = require('mongodb-memory-server');

// Один временный сервер MongoDB в памяти на весь прогон тестов
module.exports = async () => {
    const mongod = await MongoMemoryServer.create();
    globalThis.__MONGOD__ = mongod;
    process.env.MONGO_TEST_URI = mongod.getUri();
};

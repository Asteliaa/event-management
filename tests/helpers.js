const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

const tokenFor = (payload = {}, options = { expiresIn: '1h' }) =>
    jwt.sign({ id: 1, email: 'a@b.c', role: 'user', ...payload }, process.env.JWT_SECRET, options);

module.exports = { tokenFor };

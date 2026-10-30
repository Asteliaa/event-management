const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const register = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Укажите email и password" });
    }

    try {
        const existing = await User.findOne({ email: String(email).toLowerCase() });
        if (existing) {
            return res.status(409).json({ message: "Пользователь с таким email уже существует" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ email, passwordHash });

        res.status(201).json({ id: user.id, email: user.email, role: user.role });
    } catch (error) {
        res.status(500).json({ message: "Ошибка при регистрации", error: error.message });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Укажите email и password" });
    }

    try {
        const user = await User.findOne({ email: String(email).toLowerCase() });
        const valid = user && await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ message: "Неверный email или пароль" });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ token });
    } catch (error) {
        res.status(500).json({ message: "Ошибка при входе", error: error.message });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('email role createdAt');
        if (!user) {
            return res.status(404).json({ message: "Пользователь не найден" });
        }
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: "Ошибка сервера", error: error.message });
    }
};

const getUsers = async (req, res) => {
    try {
        const users = await User.find().select('email role createdAt').sort({ createdAt: 1 });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Ошибка сервера", error: error.message });
    }
};

// DELETE /users/:id – удаление пользователя; его регистрации удаляет хук модели (каскад)
const deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id).select('email role');
        if (!user) {
            return res.status(404).json({ message: "Пользователь не найден" });
        }
        res.status(200).json(user);
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: "Некорректный id", error: error.message });
        }
        res.status(500).json({ message: "Ошибка сервера", error: error.message });
    }
};

module.exports = { register, login, getProfile, getUsers, deleteUser };

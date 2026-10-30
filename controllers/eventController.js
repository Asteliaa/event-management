const mongoose = require('mongoose');
const { Event } = require('../models');

// Поля, которые клиент может передать при создании и изменении
const pickFields = ({ title, type, date, description, capacity, location, tags }) =>
    Object.fromEntries(
        Object.entries({ title, type, date, description, capacity, location, tags }).filter(([, v]) => v !== undefined)
    );

// Ошибки валидации Mongoose (ValidationError, CastError) – это ошибки клиента, а не сервера
const sendError = (res, error, message) => {
    if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
        return res.status(400).json({ message: "Некорректные данные", error: error.message });
    }
    res.status(500).json({ message, error: error.message });
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /events?search=&type=&tag=&city= – поиск по названию без учета регистра и фильтры
const getEvents = async (req, res) => {
    const { search, type, tag, city } = req.query;
    const filter = {};
    if (search) filter.title = { $regex: escapeRegex(search), $options: 'i' };
    if (type) filter.type = type;
    if (tag) filter.tags = tag.toLowerCase();              // массив содержит значение
    if (city) filter['location.city'] = city;               // поиск по вложенному полю

    try {
        const events = await Event.find(filter).sort({ date: 1 });
        res.status(200).json(events);
    } catch (error) {
        sendError(res, error, "Ошибка при получении мероприятий");
    }
};

// GET /events/stats – агрегация: число мероприятий, участников и билетов по типам
const getStats = async (req, res) => {
    try {
        const stats = await Event.aggregate([
            { $unwind: { path: '$registrations', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { type: '$type', event: '$_id' },
                    participants: { $sum: { $cond: [{ $ifNull: ['$registrations', false] }, 1, 0] } },
                    tickets: {
                        $sum: {
                            $cond: [
                                { $eq: ['$registrations.status', 'cancelled'] },
                                0,
                                { $ifNull: ['$registrations.tickets', 0] }
                            ]
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$_id.type',
                    events: { $sum: 1 },
                    participants: { $sum: '$participants' },
                    tickets: { $sum: '$tickets' }
                }
            },
            { $project: { _id: 0, type: '$_id', events: 1, participants: 1, tickets: 1 } },
            { $sort: { tickets: -1, type: 1 } }
        ]);
        res.status(200).json(stats);
    } catch (error) {
        sendError(res, error, "Ошибка при подсчете статистики");
    }
};

const getEventById = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id).populate('registrations.user', 'email role');
        if (!event) {
            return res.status(404).json({ message: "Мероприятие не найдено" });
        }
        res.status(200).json(event);
    } catch (error) {
        sendError(res, error, "Ошибка сервера");
    }
};

const createEvent = async (req, res) => {
    const { title, type, date } = req.body;

    if (!title || !type || !date) {
        return res.status(400).json({ message: "Заполните обязательные поля: title, type, date" });
    }

    try {
        const newEvent = await Event.create(pickFields(req.body));
        res.status(201).json(newEvent);
    } catch (error) {
        sendError(res, error, "Ошибка при создании");
    }
};

const updateEvent = async (req, res) => {
    try {
        const updatedEvent = await Event.findByIdAndUpdate(req.params.id, pickFields(req.body), {
            returnDocument: 'after', // вернуть документ после изменения (раньше – new: true)
            runValidators: true
        });

        if (!updatedEvent) {
            return res.status(404).json({ message: "Мероприятие не найдено" });
        }

        res.status(200).json(updatedEvent);
    } catch (error) {
        sendError(res, error, "Ошибка при обновлении");
    }
};

// Удаляет мероприятие вместе со всеми вложенными регистрациями и возвращает удаленный документ
const deleteEvent = async (req, res) => {
    try {
        const deleted = await Event.findByIdAndDelete(req.params.id);

        if (!deleted) {
            return res.status(404).json({ message: "Мероприятие не найдено" });
        }

        res.status(200).json(deleted);
    } catch (error) {
        sendError(res, error, "Ошибка при удалении");
    }
};

module.exports = {
    getEvents,
    getStats,
    getEventById,
    createEvent,
    updateEvent,
    deleteEvent,
    sendError
};

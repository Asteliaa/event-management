const { Op } = require('sequelize');
const { Event } = require('../models');

// Поля, которые клиент может передать при создании и изменении
const pickFields = ({ title, type, date, description, capacity }) =>
    Object.fromEntries(
        Object.entries({ title, type, date, description, capacity }).filter(([, v]) => v !== undefined)
    );

// GET /events?search=...&type=... – поиск по названию без учета регистра и фильтр по типу
const getEvents = async (req, res) => {
    const { search, type } = req.query;
    const where = {};
    if (search) where.title = { [Op.iLike]: `%${search}%` };
    if (type) where.type = type;

    try {
        const events = await Event.findAll({ where, order: [['date', 'ASC']] });
        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ message: "Ошибка при получении мероприятий", error });
    }
};

const getEventById = async (req, res) => {
    try {
        const event = await Event.findByPk(req.params.id);
        if (!event) {
            return res.status(404).json({ message: "Мероприятие не найдено" });
        }
        res.status(200).json(event);
    } catch (error) {
        res.status(500).json({ message: "Ошибка сервера", error });
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
        res.status(500).json({ message: "Ошибка при создании", error });
    }
};

const updateEvent = async (req, res) => {
    try {
        const [updated] = await Event.update(pickFields(req.body), {
            where: { id: req.params.id }
        });
        
        if (!updated) {
            return res.status(404).json({ message: "Мероприятие не найдено" });
        }
        
        const updatedEvent = await Event.findByPk(req.params.id);
        res.status(200).json(updatedEvent);
    } catch (error) {
        res.status(500).json({ message: "Ошибка при обновлении", error });
    }
};

const deleteEvent = async (req, res) => {
    try {
        const deleted = await Event.destroy({
            where: { id: req.params.id }
        });
        
        if (!deleted) {
            return res.status(404).json({ message: "Мероприятие не найдено" });
        }
        
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: "Ошибка при удалении", error });
    }
};

module.exports = {
    getEvents,
    getEventById,
    createEvent,
    updateEvent,
    deleteEvent
};
const { Event } = require('../models');

const getEvents = async (req, res) => {
    try {
        const events = await Event.findAll();
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
    const { title, type, date, description } = req.body;
    
    if (!title || !type || !date) {
        return res.status(400).json({ message: "Заполните обязательные поля: title, type, date" });
    }

    try {
        const newEvent = await Event.create({ title, type, date, description });
        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ message: "Ошибка при создании", error });
    }
};

const updateEvent = async (req, res) => {
    try {
        const [updated] = await Event.update(req.body, {
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
const events = require('../models/eventModel');

exports.getAllEvents = (_req, res) => {
    res.status(200).json(events);
};

exports.getEventById = (req, res) => {
    const event = events.find(e => e.id === req.params.id);
    if (!event) {
        return res.status(404).json({ error: "Мероприятие не найдено" });
    }
    res.status(200).json(event);
};

exports.createEvent = (req, res) => {
    const { title, type, date, description } = req.body;
    
    if (!title || !type || !date) {
        return res.status(400).json({ error: "Отсутствуют обязательные поля: title, type, date" });
    }

    const newEvent = {
        id: Date.now().toString(),        
        title,
        type,
        date,
        description: description || ""
    };

    events.push(newEvent);
    res.status(201).json(newEvent);
};

exports.updateEvent = (req, res) => {
    const eventIndex = events.findIndex(e => e.id === req.params.id);
    
    if (eventIndex === -1) {
        return res.status(404).json({ error: "Мероприятие не найдено" });
    }

    const { title, type, date, description } = req.body;
    
    if (!title || !type || !date) {
        return res.status(400).json({ error: "Отсутствуют обязательные поля: title, type, date" });
    }

    events[eventIndex] = {
        id: req.params.id,
        title,
        type,
        date,
        description: description || ""
    };

    res.status(200).json(events[eventIndex]);
};

exports.deleteEvent = (req, res) => {
    const eventIndex = events.findIndex(e => e.id === req.params.id);
    
    if (eventIndex === -1) {
        return res.status(404).json({ error: "Мероприятие не найдено" });
    }

    events.splice(eventIndex, 1);
    res.status(204).send(); 
};
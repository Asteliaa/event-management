const { Event } = require('../models');
const { sendError } = require('./eventController');

// Изменять и отменять регистрацию может ее владелец или администратор
const canManage = (user, registration) =>
    user.role === 'admin' || (registration.user && registration.user.toString() === user.id);

const isValidTickets = (n) => Number.isInteger(n) && n >= 1;

// POST /events/:id/registrations – регистрация текущего пользователя на мероприятие
const register = async (req, res) => {
    const tickets = req.body.tickets === undefined ? 1 : req.body.tickets;
    if (!isValidTickets(tickets)) {
        return res.status(400).json({ message: "tickets должно быть целым числом не меньше 1" });
    }

    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ message: "Мероприятие не найдено" });
        }
        if (event.registrations.some((r) => r.email === req.user.email && r.status !== 'cancelled')) {
            return res.status(409).json({ message: "Вы уже зарегистрированы на это мероприятие" });
        }
        if (!event.hasSeats(tickets)) {
            return res.status(409).json({ message: `Недостаточно мест, осталось: ${event.seatsLeft}` });
        }

        // Регистрация добавляется в массив внутри документа мероприятия
        event.registrations.push({
            user: req.user.id,
            name: req.body.name || req.user.email,
            email: req.user.email,
            tickets
        });
        await event.save();

        res.status(201).json(event.registrations[event.registrations.length - 1]);
    } catch (error) {
        sendError(res, error, "Ошибка при регистрации на мероприятие");
    }
};

// PATCH /events/:id/registrations/:regId – изменение элемента массива (число билетов, статус)
// позиционным оператором $, без перезаписи всего документа
const updateRegistration = async (req, res) => {
    const { tickets, status } = req.body;
    const update = {};
    if (tickets !== undefined) {
        if (!isValidTickets(tickets)) {
            return res.status(400).json({ message: "tickets должно быть целым числом не меньше 1" });
        }
        update['registrations.$.tickets'] = tickets;
    }
    if (status !== undefined) update['registrations.$.status'] = status;
    if (!Object.keys(update).length) {
        return res.status(400).json({ message: "Передайте tickets или status" });
    }

    try {
        const event = await Event.findById(req.params.id);
        const registration = event && event.registrations.id(req.params.regId);
        if (!registration) {
            return res.status(404).json({ message: "Регистрация не найдена" });
        }
        if (!canManage(req.user, registration)) {
            return res.status(403).json({ message: "Можно изменять только свою регистрацию" });
        }
        if (tickets !== undefined && event.capacity &&
            event.seatsTaken - registration.tickets + tickets > event.capacity) {
            return res.status(409).json({ message: `Недостаточно мест, осталось: ${event.seatsLeft}` });
        }

        const updated = await Event.findOneAndUpdate(
            { _id: req.params.id, 'registrations._id': req.params.regId },
            { $set: update },
            { returnDocument: 'after', runValidators: true }
        );
        res.status(200).json(updated.registrations.id(req.params.regId));
    } catch (error) {
        sendError(res, error, "Ошибка при изменении регистрации");
    }
};

// DELETE /events/:id/registrations/:regId – удаление элемента массива оператором $pull
const cancelRegistration = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        const registration = event && event.registrations.id(req.params.regId);
        if (!registration) {
            return res.status(404).json({ message: "Регистрация не найдена" });
        }
        if (!canManage(req.user, registration)) {
            return res.status(403).json({ message: "Можно отменить только свою регистрацию" });
        }

        await Event.updateOne({ _id: req.params.id }, { $pull: { registrations: { _id: req.params.regId } } });
        res.status(204).send();
    } catch (error) {
        sendError(res, error, "Ошибка при отмене регистрации");
    }
};

module.exports = { register, updateRegistration, cancelRegistration };

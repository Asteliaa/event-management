const eventService = require('../services/event.service');
const registrationService = require('../services/registration.service');
const notify = require('../socket/notify');
const { eventToIcs } = require('../utils/ics');
const { toCsv } = require('../utils/csv');

// Контроллер только разбирает запрос и формирует ответ; логика – в сервисах

const list = async (req, res) => res.json(await eventService.list(req.valid.query));
const cities = async (req, res) => res.json(await eventService.cities());
const getById = async (req, res) => res.json(await eventService.getById(req.params.id, req.user));
const similar = async (req, res) => res.json(await eventService.similar(req.params.id));

const create = async (req, res) => {
    const event = await eventService.create(req.body, req.user);
    notify.toAll('event:created', { event: event.toJSON(), by: req.user.name });
    res.status(201).location(`/api/v1/events/${event.id}`).json(event);
};

const update = async (req, res) => {
    const event = await eventService.update(req.params.id, req.body, req.user);
    notify.toAll('event:updated', { event: event.toJSON(), by: req.user.name });
    res.json(event);
};

const remove = async (req, res) => {
    const event = await eventService.remove(req.params.id, req.user);
    notify.toAll('event:deleted', { id: event.id, title: event.title, by: req.user.name });
    res.status(204).send();
};

// GET /events/:id/calendar.ics – файл для добавления в календарь
const calendar = async (req, res) => {
    const event = await eventService.findOrFail(req.params.id);
    res.type('text/calendar; charset=utf-8')
        .attachment(`event-${event.id}.ics`)
        .send(eventToIcs(event.toJSON()));
};

const register = async (req, res) => {
    const { registration, event, reminder } = await registrationService.register(req.params.id, req.user, req.body);
    notify.toRooms([notify.rooms.event(event.id), ...notify.eventStaffRooms(event)], 'registration:created', {
        eventId: event.id, title: event.title, name: req.user.name, seatsLeft: event.seatsLeft
    });
    res.status(201).json({ ...registration.toJSON(), autoReminder: reminder ? reminder.toJSON() : null });
};

// Список участников (организатор мероприятия или администратор); ?format=csv – выгрузка для Excel
const registrations = async (req, res) => {
    const list = await registrationService.listForEvent(req.params.id, req.user, req.valid.query);
    if (req.valid.query.format !== 'csv') return res.json(list);
    const csv = toCsv([
        { title: 'Имя', value: (r) => r.user?.name },
        { title: 'Email', value: (r) => r.user?.email },
        { title: 'Статус', value: (r) => r.status },
        { title: 'Комментарий', value: (r) => r.comment },
        { title: 'Дата регистрации', value: (r) => r.createdAt.toISOString() },
        { title: 'Дата отмены', value: (r) => r.cancelledAt?.toISOString() }
    ], list);
    res.type('text/csv; charset=utf-8').attachment(`participants-${req.params.id}.csv`).send(csv);
};

// Мероприятия организатора и статистика мероприятия
const managed = async (req, res) => res.json(await eventService.listManaged(req.user, req.valid.query));
const stats = async (req, res) => res.json(await eventService.stats(req.params.id, req.user));

module.exports = { list, cities, getById, similar, create, update, remove, calendar, register, registrations, managed, stats };

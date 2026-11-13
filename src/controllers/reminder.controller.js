const reminderService = require('../services/reminder.service');

const list = async (req, res) => res.json(await reminderService.list(req.user.id, req.valid.query));
const create = async (req, res) => res.status(201).json(await reminderService.create(req.user.id, req.body));
const update = async (req, res) => res.json(await reminderService.update(req.user.id, req.params.id, req.body));

const remove = async (req, res) => {
    await reminderService.remove(req.user.id, req.params.id);
    res.status(204).send();
};

module.exports = { list, create, update, remove };

const userService = require('../services/user.service');
const accountService = require('../services/account.service');
const statsService = require('../services/stats.service');

const users = async (req, res) => res.json(await userService.list(req.valid.query));
// роль и блокировка
const updateUser = async (req, res) => res.json(await accountService.updateByAdmin(req.params.id, req.body, req.user));
const deactivateUser = async (req, res) => res.json(await accountService.deactivateByAdmin(req.params.id, req.user));
const reactivateUser = async (req, res) => res.json(await accountService.reactivateByAdmin(req.params.id));

// удаление = обезличивание (история регистраций сохраняется)
const removeUser = async (req, res) => {
    await accountService.deleteByAdmin(req.params.id, req.user);
    res.status(204).send();
};

const stats = async (req, res) => res.json(await statsService.overview());

module.exports = { users, updateUser, deactivateUser, reactivateUser, removeUser, stats };

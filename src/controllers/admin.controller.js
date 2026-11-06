const userService = require('../services/user.service');
const statsService = require('../services/stats.service');

const users = async (req, res) => res.json(await userService.list(req.valid.query));
const updateUser = async (req, res) => res.json(await userService.update(req.params.id, req.body, req.user));

const removeUser = async (req, res) => {
    await userService.remove(req.params.id, req.user);
    res.status(204).send();
};

const stats = async (req, res) => res.json(await statsService.overview());

module.exports = { users, updateUser, removeUser, stats };

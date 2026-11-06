const authService = require('../services/auth.service');
const userService = require('../services/user.service');
const registrationService = require('../services/registration.service');

const register = async (req, res) => res.status(201).json(await authService.register(req.body));
const login = async (req, res) => res.json(await authService.login(req.body));
const me = async (req, res) => res.json(await authService.getMe(req.user.id));
const updateMe = async (req, res) => res.json(await authService.updateProfile(req.user.id, req.body));

const changePassword = async (req, res) => {
    await authService.changePassword(req.user.id, req.body);
    res.status(204).send();
};

const myRegistrations = async (req, res) =>
    res.json(await registrationService.listMine(req.user.id, { when: req.query.when }));

const myFavorites = async (req, res) => res.json(await userService.listFavorites(req.user.id));

const addFavorite = async (req, res) => {
    await userService.addFavorite(req.user.id, req.params.id);
    res.status(204).send();
};

const removeFavorite = async (req, res) => {
    await userService.removeFavorite(req.user.id, req.params.id);
    res.status(204).send();
};

module.exports = { register, login, me, updateMe, changePassword, myRegistrations, myFavorites, addFavorite, removeFavorite };

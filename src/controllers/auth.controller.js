const authService = require('../services/auth.service');
const userService = require('../services/user.service');
const registrationService = require('../services/registration.service');
const accountService = require('../services/account.service');
const passwordReset = require('../services/password-reset.service');
const notify = require('../socket/notify');

const register = async (req, res) => res.status(201).json(await authService.register(req.body));
const login = async (req, res) => res.json(await authService.login(req.body));
// 202 и одинаковый текст для любого адреса: по ответу нельзя узнать, есть ли аккаунт.
// Письмо отправляется в фоне, сбой SMTP не меняет ответ
const forgotPassword = async (req, res) => {
    await passwordReset.requestReset(req.body);
    res.status(202).json({ message: 'Если аккаунт с этим адресом существует, мы отправили письмо со ссылкой для сброса пароля' });
};

// Новый пароль по токену. Автоматического входа нет: все сеансы завершаются, дальше – обычный вход
const resetPassword = async (req, res) => {
    await passwordReset.resetPassword(req.body);
    res.json({ message: 'Пароль изменен. Войдите с новым паролем' });
};

const me = async (req, res) => res.json(await authService.getMe(req.user.id));
const updateMe = async (req, res) => res.json(await authService.updateProfile(req.user.id, req.body));

const changePassword = async (req, res) => {
    const { token } = await authService.changePassword(req.user.id, req.body);
    notify.disconnectUser(req.user.id);
    res.json({ token });
};

const myRegistrations = async (req, res) =>
    res.json(await registrationService.listMine(req.user.id, req.valid.query));

const myFavorites = async (req, res) => res.json(await userService.listFavorites(req.user.id));

const addFavorite = async (req, res) => {
    await userService.addFavorite(req.user.id, req.params.id);
    res.status(204).send();
};

const removeFavorite = async (req, res) => {
    await userService.removeFavorite(req.user.id, req.params.id);
    res.status(204).send();
};

// Деактивация и удаление своего аккаунта – с подтверждением паролем
const deactivateMe = async (req, res) => {
    await accountService.deactivateSelf(req.user.id, req.body);
    res.status(204).send();
};

const deleteMe = async (req, res) => {
    await accountService.deleteSelf(req.user.id, req.body);
    res.status(204).send();
};

module.exports = {
    forgotPassword, resetPassword,
    register, login, me, updateMe, changePassword, myRegistrations, myFavorites, addFavorite, removeFavorite, deactivateMe, deleteMe
};

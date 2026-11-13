const notificationService = require('../services/notification.service');

const list = async (req, res) => res.json(await notificationService.list(req.user.id, req.valid.query));
const unreadCount = async (req, res) => res.json({ unread: await notificationService.unreadCount(req.user.id) });
const update = async (req, res) => res.json(await notificationService.setRead(req.user.id, req.params.id, req.body.read));
const readAll = async (req, res) => res.json({ updated: await notificationService.markAllRead(req.user.id) });

module.exports = { list, unreadCount, update, readAll };

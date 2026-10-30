const express = require('express');
const router = express.Router();

const {
    getEvents,
    getStats,
    getEventById,
    createEvent,
    updateEvent,
    deleteEvent
} = require('../controllers/eventController');
const { register, updateRegistration, cancelRegistration } = require('../controllers/registrationController');
const { authenticate, isAdmin } = require('../middleware/auth');

router.get('/', getEvents);
router.get('/stats', getStats);
router.get('/:id', getEventById);
router.post('/', authenticate, isAdmin, createEvent);
router.put('/:id', authenticate, isAdmin, updateEvent);
router.delete('/:id', authenticate, isAdmin, deleteEvent);

// Вложенный массив регистраций внутри мероприятия
router.post('/:id/registrations', authenticate, register);
router.patch('/:id/registrations/:regId', authenticate, updateRegistration);
router.delete('/:id/registrations/:regId', authenticate, cancelRegistration);

module.exports = router;
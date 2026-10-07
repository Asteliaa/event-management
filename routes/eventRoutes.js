const express = require('express');
const router = express.Router();

const {
    getEvents,
    getEventById,
    createEvent,
    updateEvent,
    deleteEvent
} = require('../controllers/eventController');
const { authenticate, isAdmin } = require('../middleware/auth');

router.get('/', getEvents);
router.get('/:id', getEventById);
router.post('/', authenticate, isAdmin, createEvent);
router.put('/:id', authenticate, isAdmin, updateEvent);
router.delete('/:id', authenticate, isAdmin, deleteEvent);

module.exports = router;
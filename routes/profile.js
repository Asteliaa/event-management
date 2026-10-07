const express = require('express');
const router = express.Router();

const { authenticate, isAdmin } = require('../middleware/auth');
const { getProfile, getUsers } = require('../controllers/authController');

router.get('/profile', authenticate, getProfile);
router.get('/users', authenticate, isAdmin, getUsers);

module.exports = router;

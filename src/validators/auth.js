const { z, password, email } = require('./common');

const register = z.object({
    name: z.string().trim().min(2, 'Имя не короче 2 символов').max(80),
    email,
    password
});

const login = z.object({
    email,
    password: z.string().min(1, 'Введите пароль')
});

const updateProfile = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    city: z.string().trim().max(80).optional()
}).refine((v) => Object.keys(v).length, 'Передайте хотя бы одно поле');

const changePassword = z.object({
    currentPassword: z.string().min(1, 'Введите текущий пароль'),
    newPassword: password
});

module.exports = { register, login, updateProfile, changePassword };

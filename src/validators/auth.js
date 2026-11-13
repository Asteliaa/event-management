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

// подтверждение необратимых и чувствительных действий с аккаунтом
const confirmPassword = z.object({ password: z.string().min(1, 'Введите пароль') });

// восстановление пароля: запрос письма и установка нового пароля по токену из ссылки
const forgotPassword = z.object({ email });
const resetPassword = z.object({
    // base64url-строка из 32 байт (43 символа); значение токена в сообщения об ошибках не попадает
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Некорректная ссылка для сброса пароля'),
    password,
    passwordConfirm: z.string()
}).refine((v) => v.password === v.passwordConfirm, { message: 'Пароли не совпадают', path: ['passwordConfirm'] });

module.exports = { register, login, updateProfile, changePassword, confirmPassword, forgotPassword, resetPassword };

const { z } = require('zod');
const { isValidId } = require('../utils/id');

// Идентификатор записи: положительное целое (bigint) в виде строки, например "42"
const recordId = z.string().refine(isValidId, 'Некорректный идентификатор');
const idParam = z.object({ id: recordId });

const pageQuery = {
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(12)
};

// Пароль: от 8 символов, хотя бы одна буква и одна цифра
const password = z.string()
    .min(8, 'Пароль не короче 8 символов')
    .max(72, 'Пароль не длиннее 72 символов')
    .regex(/[A-Za-zА-Яа-яЁё]/, 'Пароль должен содержать букву')
    .regex(/\d/, 'Пароль должен содержать цифру');

const email = z.string().trim().toLowerCase().email('Некорректный email');

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

module.exports = { z, recordId, idParam, pageQuery, password, email, booleanString };

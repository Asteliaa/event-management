const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const config = require('../config');

const notFound = (req, res, next) => next(ApiError.notFound(`Эндпоинт ${req.method} ${req.originalUrl} не найден`));

// Единый обработчик ошибок: любой ответ с ошибкой имеет формат
// { error: { status, code, message, details? } }
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    let error = err;

    if (err.type === 'entity.parse.failed') {
        error = ApiError.badRequest('Некорректный JSON в теле запроса');
    } else if (err.type === 'entity.too.large') {
        error = new ApiError(413, 'Слишком большое тело запроса', { code: 'PAYLOAD_TOO_LARGE' });
    } else if (err instanceof mongoose.Error.CastError) {
        error = ApiError.badRequest(`Некорректное значение поля ${err.path}`);
    } else if (err instanceof mongoose.Error.ValidationError) {
        error = new ApiError(422, 'Ошибка валидации данных', {
            details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }))
        });
    } else if (err.code === 11000) {
        error = ApiError.conflict('Запись с такими данными уже существует', 'DUPLICATE');
    } else if (!(err instanceof ApiError)) {
        if (!config.isTest) console.error(err);
        error = new ApiError(500, 'Внутренняя ошибка сервера');
    }

    res.status(error.status).json({
        error: {
            status: error.status,
            code: error.code,
            message: error.message,
            ...(error.details && { details: error.details })
        }
    });
};

module.exports = { notFound, errorHandler };

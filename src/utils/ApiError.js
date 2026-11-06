// Ошибка с HTTP-статусом. Сервисы бросают ApiError, а единый обработчик
// (middleware/errorHandler.js) превращает ее в JSON-ответ одного формата:
// { error: { status, code, message, details? } }
class ApiError extends Error {
    constructor(status, message, { code, details } = {}) {
        super(message);
        this.status = status;
        this.code = code || ApiError.codes[status] || 'ERROR';
        this.details = details;
    }

    static badRequest(message = 'Некорректный запрос', details) {
        return new ApiError(400, message, { details });
    }
    static unauthorized(message = 'Требуется авторизация') {
        return new ApiError(401, message);
    }
    static forbidden(message = 'Недостаточно прав') {
        return new ApiError(403, message);
    }
    static notFound(message = 'Ресурс не найден') {
        return new ApiError(404, message);
    }
    static conflict(message, code) {
        return new ApiError(409, message, { code });
    }
}

ApiError.codes = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_ERROR'
};

module.exports = ApiError;

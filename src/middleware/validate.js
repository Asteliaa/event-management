const ApiError = require('../utils/ApiError');

// Проверка входных данных по схеме Zod. Проверенные и приведенные к нужным типам
// значения заменяют исходные: контроллер получает только описанные в схеме поля
const validate = (schemas) => (req, res, next) => {
    const details = [];
    for (const part of ['params', 'query', 'body']) {
        if (!schemas[part]) continue;
        const result = schemas[part].safeParse(req[part] ?? {});
        if (result.success) {
            // req.query в Express – геттер, поэтому сохраняем проверенные значения отдельно
            req.valid = { ...req.valid, [part]: result.data };
            if (part !== 'query') req[part] = result.data;
        } else {
            details.push(...result.error.issues.map((i) => ({
                field: [part, ...i.path].join('.'),
                message: i.message
            })));
        }
    }
    if (details.length) {
        return next(new ApiError(422, 'Ошибка валидации данных', { details }));
    }
    next();
};

module.exports = validate;

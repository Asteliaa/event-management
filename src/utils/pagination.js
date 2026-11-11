// Параметры постраничного вывода из query и формат ответа со списком:
// { data: [...], meta: { page, limit, total, pages } }
const paginate = ({ page = 1, limit = 12 } = {}) => ({ page, limit, skip: (page - 1) * limit });

const pageResult = (data, total, { page, limit }) => ({
    data,
    meta: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) }
});

// Шаблон «содержит подстроку» для ILIKE: символы %, _ и \ из ввода пользователя экранируются
const likePattern = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

module.exports = { paginate, pageResult, likePattern };

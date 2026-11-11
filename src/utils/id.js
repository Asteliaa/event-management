// Идентификаторы записей – bigint (PostgreSQL identity). В API, Socket.IO и клиенте они передаются
// строками: JavaScript Number теряет точность после 2^53, а строка – нет
const MAX_BIGINT = 9223372036854775807n;

const isValidId = (value) => {
    if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) return false;
    return BigInt(value) <= MAX_BIGINT;
};

module.exports = { isValidId };

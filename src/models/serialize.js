// Общий вывод записей в JSON: поля без значения (null) не выводятся – так же,
// как в прежней версии на MongoDB, где незаданные поля отсутствовали в документе.
// Идентификаторы (bigint) драйвер возвращает строками и в таком виде попадают в API
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));

// Связанная запись: если она загружена (include) – вложенный объект, иначе – id строкой
const ref = (instance, alias, foreignKey) => {
    const loaded = instance[alias];
    if (loaded) return loaded.toJSON();
    const id = instance.get(foreignKey);
    return id === null || id === undefined ? undefined : String(id);
};

module.exports = { compact, ref };

const { QueryTypes } = require('sequelize');
const { sequelize, Category } = require('../models');
const ApiError = require('../utils/ApiError');

const TRANSLIT = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
    м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
    щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

// «Бизнес и стартапы» → «biznes-i-startapy»: человекочитаемый идентификатор для URL
const slugify = (s) => s.toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';

// Категории с числом предстоящих опубликованных мероприятий; сортировка по правилам русского языка
const list = async () => {
    const [categories, counts] = await Promise.all([
        Category.findAll({ order: [[sequelize.literal('name COLLATE ru_icu'), 'ASC']] }),
        sequelize.query(
            `SELECT category_id AS "categoryId", count(*)::int AS count
             FROM events
             WHERE category_id IS NOT NULL AND starts_at >= now() AND status = 'published'
             GROUP BY category_id`,
            { type: QueryTypes.SELECT }
        )
    ]);
    const byId = new Map(counts.map((c) => [String(c.categoryId), c.count]));
    return categories.map((c) => ({ ...c.toJSON(), eventsCount: byId.get(String(c.id)) || 0 }));
};

const create = (data) => Category.create({ ...data, slug: slugify(data.name) });

const findOrFail = async (id) => {
    const category = await Category.findByPk(id);
    if (!category) throw ApiError.notFound('Категория не найдена');
    return category;
};

const update = async (id, data) => {
    const category = await findOrFail(id);
    const patch = { ...data };
    if (data.name) patch.slug = slugify(data.name);
    await category.update(patch);
    return category;
};

// При удалении категории мероприятия остаются, но без категории (внешний ключ ON DELETE SET NULL)
const remove = async (id) => {
    const category = await findOrFail(id);
    await category.destroy();
    return category;
};

module.exports = { list, create, update, remove, slugify };

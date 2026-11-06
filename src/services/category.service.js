const { Category, Event } = require('../models');
const ApiError = require('../utils/ApiError');

const TRANSLIT = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
    м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
    щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

// «Бизнес и стартапы» → «biznes-i-startapy»: человекочитаемый идентификатор для URL
const slugify = (s) => s.toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';

// Категории с числом предстоящих мероприятий (агрегация по коллекции events)
const list = async () => {
    const [categories, counts] = await Promise.all([
        Category.find().collation({ locale: 'ru' }).sort({ name: 1 }),
        Event.aggregate([
            { $match: { category: { $ne: null }, startsAt: { $gte: new Date() }, status: 'published' } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ])
    ]);
    const byId = new Map(counts.map((c) => [c._id.toString(), c.count]));
    return categories.map((c) => ({ ...c.toJSON(), eventsCount: byId.get(c.id) || 0 }));
};

const create = (data) => Category.create({ ...data, slug: slugify(data.name) });

const update = async (id, data) => {
    const patch = { ...data };
    if (data.name) patch.slug = slugify(data.name);
    const category = await Category.findByIdAndUpdate(id, patch, { returnDocument: 'after', runValidators: true });
    if (!category) throw ApiError.notFound('Категория не найдена');
    return category;
};

// При удалении категории мероприятия остаются, но без категории
const remove = async (id) => {
    const category = await Category.findByIdAndDelete(id);
    if (!category) throw ApiError.notFound('Категория не найдена');
    await Event.updateMany({ category: id }, { $unset: { category: 1 } });
    return category;
};

module.exports = { list, create, update, remove, slugify };

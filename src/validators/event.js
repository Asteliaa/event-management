const { z, recordId, pageQuery, booleanString } = require('./common');
const { Event } = require('../models');

const location = z.object({
    city: z.string().trim().max(80).optional(),
    venue: z.string().trim().max(150).optional(),
    online: z.boolean().optional(),
    url: z.string().trim().url('Некорректная ссылка').or(z.literal('')).optional()
});

const base = {
    title: z.string().trim().min(3, 'Название не короче 3 символов').max(150),
    description: z.string().max(5000).optional(),
    type: z.enum(Event.EVENT_TYPES),
    status: z.enum(Event.EVENT_STATUSES).optional(),
    category: recordId.nullable().optional(),
    // владелец мероприятия: передать его может только администратор
    organizer: recordId.optional(),
    startsAt: z.coerce.date({ message: 'Некорректная дата начала' }),
    endsAt: z.coerce.date().nullable().optional(),
    coverUrl: z.string().trim().url('Некорректная ссылка на обложку').or(z.literal('')).optional(),
    capacity: z.number().int().min(1).max(100000).nullable().optional(),
    location: location.optional(),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).optional()
};

const endsAfterStart = (v) => !v.endsAt || !v.startsAt || v.endsAt > v.startsAt;
const endsMessage = { message: 'Окончание должно быть позже начала', path: ['endsAt'] };

const create = z.object(base).refine(endsAfterStart, endsMessage);
const update = z.object(base).partial()
    .refine((v) => Object.keys(v).length, 'Передайте хотя бы одно поле')
    .refine(endsAfterStart, endsMessage);

const list = z.object({
    ...pageQuery,
    search: z.string().trim().max(100).optional(),
    type: z.enum(Event.EVENT_TYPES).optional(),
    category: recordId.optional(),
    city: z.string().trim().max(80).optional(),
    tag: z.string().trim().toLowerCase().optional(),
    online: booleanString.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    // when: upcoming – будущие (по умолчанию), past – прошедшие, all – все
    when: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
    sort: z.enum(['date', '-date', 'popular', 'new']).default('date')
});

// Одна регистрация – одно место: поле tickets больше не используется; для совместимости принимается только 1
const register = z.object({
    tickets: z.literal(1, { message: 'Одна регистрация – одно место: поле tickets больше не поддерживается' }).optional(),
    comment: z.string().trim().max(300).optional()
});

module.exports = { create, update, list, register };

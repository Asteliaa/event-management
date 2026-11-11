const { z, recordId, pageQuery } = require('./common');
const { User, Registration } = require('../models');

const category = z.object({
    name: z.string().trim().min(2).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #RRGGBB').optional(),
    description: z.string().max(300).optional()
});

const registrationUpdate = z.object({
    tickets: z.number().int().min(1).max(10).optional(),
    status: z.enum(Registration.STATUSES).optional(),
    comment: z.string().trim().max(300).optional()
}).refine((v) => Object.keys(v).length, 'Передайте хотя бы одно поле');

const reminderCreate = z.object({
    event: recordId,
    // за сколько минут до начала напомнить: от 5 минут до 30 дней
    offsetMinutes: z.number().int().min(5).max(60 * 24 * 30)
});

const reminderUpdate = z.object({
    offsetMinutes: z.number().int().min(5).max(60 * 24 * 30).optional(),
    read: z.boolean().optional()
}).refine((v) => Object.keys(v).length, 'Передайте хотя бы одно поле');

const reminderList = z.object({
    status: z.enum(['pending', 'sent']).optional(),
    unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional()
});

const userList = z.object({
    ...pageQuery,
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    role: z.enum(User.ROLES).optional()
});

const userUpdate = z.object({
    role: z.enum(User.ROLES).optional(),
    blocked: z.boolean().optional()
}).refine((v) => Object.keys(v).length, 'Передайте role или blocked');

const registrationList = z.object({
    format: z.enum(['json', 'csv']).default('json')
});

module.exports = {
    category, registrationUpdate, reminderCreate, reminderUpdate, reminderList,
    userList, userUpdate, registrationList
};

const { z, recordId, pageQuery } = require('./common');
const { User, Registration, Reminder } = require('../models');

const category = z.object({
    name: z.string().trim().min(2).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #RRGGBB').optional(),
    description: z.string().max(300).optional()
});

// Отметка о посещении (attended) и комментарий участника; отмена – отдельным запросом DELETE
const registrationUpdate = z.object({
    attended: z.boolean().optional(),
    comment: z.string().trim().max(300).optional()
}).strict().refine((v) => Object.keys(v).length, 'Передайте хотя бы одно поле');

// Причина отмены участия: обязательна для организатора и администратора (проверяет сервис)
const registrationCancel = z.object({
    reason: z.string().trim().min(3, 'Причина не короче 3 символов').max(500).optional()
});

const reminderCreate = z.object({
    event: recordId,
    // за сколько минут до начала напомнить: от 5 минут до 30 дней
    offsetMinutes: z.number().int().min(5).max(60 * 24 * 30)
});

const reminderUpdate = z.object({
    offsetMinutes: z.number().int().min(5).max(60 * 24 * 30)
});

const reminderList = z.object({
    status: z.enum(Reminder.STATUSES).optional()
});

const notificationList = z.object({
    ...pageQuery,
    limit: z.coerce.number().int().min(1).max(100).default(20),
    unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional()
});

const notificationUpdate = z.object({ read: z.boolean() });

const userList = z.object({
    ...pageQuery,
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    role: z.enum(User.ROLES).optional(),
    status: z.enum(User.STATUSES).optional()
});

const userUpdate = z.object({
    role: z.enum(User.ROLES).optional(),
    blocked: z.boolean().optional()
}).refine((v) => Object.keys(v).length, 'Передайте role или blocked');

const registrationList = z.object({
    format: z.enum(['json', 'csv']).default('json'),
    // all – все, включая отмененные (история); active – неотмененные
    status: z.enum(['all', 'active', 'attended', ...Registration.STATUSES]).default('all')
});

const managedList = z.object({
    ...pageQuery,
    limit: z.coerce.number().int().min(1).max(100).default(20),
    all: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    status: z.enum(['draft', 'published', 'cancelled']).optional(),
    search: z.string().trim().max(100).optional()
});

const myRegistrations = z.object({
    when: z.enum(['all', 'upcoming', 'past']).default('all'),
    status: z.enum(['active', 'cancelled', 'all']).default('active')
});

module.exports = {
    registrationCancel,
    category, registrationUpdate, reminderCreate, reminderUpdate, reminderList,
    userList, userUpdate, registrationList, managedList, myRegistrations, notificationList, notificationUpdate
};

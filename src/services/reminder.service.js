const { Op, QueryTypes } = require('sequelize');
const config = require('../config');
const { sequelize, Reminder, Event, Registration } = require('../models');
const ApiError = require('../utils/ApiError');

// Напоминания привязаны к регистрации и к версии расписания мероприятия (schedule_version).
// - Перенос начала/окончания увеличивает версию: напоминания пересчитываются; если новое время
//   уже прошло – статус skipped, если отправленное снова в будущем – оно ждет отправки по новой версии.
// - Смена места, описания и т. п. версию не меняет и напоминаний не касается.
// - Ключ доставки reminder:<id>:v<версия> (notifications.dedup_key): одно напоминание
//   для одной версии расписания доставляется не больше одного раза.

const remindAtFor = (event, offsetMinutes) => new Date(new Date(event.startsAt).getTime() - offsetMinutes * 60_000);

const includeEvent = {
    association: 'event',
    attributes: ['id', 'title', 'startsAt', 'endsAt', 'timezone', 'type', 'locationCity', 'locationVenue', 'locationOnline', 'coverUrl', 'status']
};

const withEvent = (id, transaction) => Reminder.findByPk(id, { include: [includeEvent], transaction });

// Автоматическое напоминание при регистрации: за сутки до начала,
// а если до начала меньше суток – за час (если и это время прошло, напоминание не создается).
// Вызывается внутри транзакции регистрации (строка мероприятия уже заблокирована)
const createAuto = async (registration, event, transaction) => {
    const now = Date.now();
    const offset = [config.reminders.defaultOffsetMinutes, 60]
        .find((m) => remindAtFor(event, m).getTime() > now);
    if (offset === undefined) return null;
    return Reminder.create({
        userId: registration.userId,
        eventId: event.id,
        registrationId: registration.id,
        offsetMinutes: offset,
        remindAt: remindAtFor(event, offset),
        scheduleVersion: event.scheduleVersion,
        kind: 'auto'
    }, { transaction });
};

const uniqueError = (err) => {
    if (err.name === 'SequelizeUniqueConstraintError') return ApiError.conflict('Такое напоминание уже есть', 'REMINDER_EXISTS');
    return err;
};

// Свое напоминание – только при активной регистрации. Строка мероприятия блокируется FOR SHARE:
// одновременный перенос дождется создания напоминания и пересчитает его вместе с остальными
const create = async (userId, { event: eventId, offsetMinutes }) => {
    const id = await sequelize.transaction(async (transaction) => {
        const event = await Event.findByPk(eventId, { transaction, lock: transaction.LOCK.SHARE });
        if (!event || event.status === 'draft') throw ApiError.notFound('Мероприятие не найдено');
        const registration = await Registration.findOne({
            where: { userId, eventId, status: { [Op.ne]: 'cancelled' } }, transaction
        });
        if (!registration) {
            throw ApiError.conflict('Напоминания доступны после регистрации на мероприятие', 'REGISTRATION_REQUIRED');
        }
        if (event.status === 'cancelled') throw ApiError.conflict('Мероприятие отменено', 'EVENT_CANCELLED');
        const remindAt = remindAtFor(event, offsetMinutes);
        if (remindAt <= new Date()) {
            throw ApiError.badRequest('Время напоминания уже прошло, выберите меньший интервал');
        }
        try {
            const reminder = await sequelize.transaction({ transaction }, (t) => Reminder.create({
                userId, eventId, registrationId: registration.id, offsetMinutes, remindAt, scheduleVersion: event.scheduleVersion
            }, { transaction: t }));
            return reminder.id;
        } catch (err) {
            throw uniqueError(err);
        }
    });
    return withEvent(id);
};

// Без фильтра – ожидающие и отправленные (отмененные и пропущенные – только по status).
// Отметка о прочтении теперь у уведомлений (/notifications)
const list = async (userId, { status } = {}) => {
    const where = { userId, status: status || ['pending', 'sent'] };
    const direction = status === 'pending' ? 'ASC' : 'DESC';
    return Reminder.findAll({
        where,
        include: [includeEvent],
        order: [['remindAt', direction], ['id', direction]],
        limit: 100
    });
};

const findOwn = async (userId, id) => {
    const reminder = await Reminder.findByPk(id);
    if (!reminder || String(reminder.userId) !== String(userId)) throw ApiError.notFound('Напоминание не найдено');
    return reminder;
};

const update = async (userId, id, { offsetMinutes }) => {
    const reminder = await findOwn(userId, id);
    if (reminder.status !== 'pending') throw ApiError.badRequest('Изменить можно только ожидающее напоминание');
    const event = await Event.findByPk(reminder.eventId);
    const remindAt = remindAtFor(event, offsetMinutes);
    if (remindAt <= new Date()) throw ApiError.badRequest('Время напоминания уже прошло');
    Object.assign(reminder, { offsetMinutes, remindAt, kind: 'custom' });
    try {
        await reminder.save();
    } catch (err) {
        throw uniqueError(err);
    }
    return withEvent(reminder.id);
};

// Удаление пользователем: ожидающее напоминание отменяется (остается в истории), остальные удаляются
const remove = async (userId, id) => {
    const reminder = await findOwn(userId, id);
    if (reminder.status === 'pending') {
        await reminder.update({ status: 'cancelled', cancelReason: 'user' });
    } else {
        await reminder.destroy();
    }
};

// Перенос мероприятия (новая версия расписания): напоминания активных регистраций пересчитываются.
// Время в будущем – ждет отправки (в том числе ранее отправленное: по новому расписанию оно нужно снова),
// время в прошлом – ожидавшее становится skipped, отправленное остается отправленным.
// Вызывается в транзакции изменения мероприятия, строка мероприятия заблокирована
const rescheduleForEvent = (event, transaction) => sequelize.query(
    `UPDATE reminders r SET
         remind_at = :startsAt::timestamptz - make_interval(mins => r.offset_minutes),
         schedule_version = :version,
         status = CASE
             WHEN :startsAt::timestamptz - make_interval(mins => r.offset_minutes) > now() THEN 'pending'
             WHEN r.status = 'pending' THEN 'skipped'
             ELSE r.status END,
         updated_at = now()
     FROM registrations reg
     WHERE r.registration_id = reg.id AND reg.status <> 'cancelled'
       AND r.event_id = :eventId AND r.status IN ('pending', 'sent', 'skipped')`,
    { replacements: { startsAt: event.startsAt, version: event.scheduleVersion, eventId: event.id }, transaction }
);

// Отмена ожидающих напоминаний регистрации (отмена участия и т. п.)
const cancelForRegistration = (registrationId, reason, transaction) => Reminder.update(
    { status: 'cancelled', cancelReason: reason },
    { where: { registrationId, status: 'pending' }, transaction }
);

// Отмена мероприятия: ожидающие напоминания всех участников отменяются
const cancelForEvent = (eventId, transaction) => Reminder.update(
    { status: 'cancelled', cancelReason: 'event_cancelled' },
    { where: { eventId, status: 'pending' }, transaction }
);

// Выбор наступивших напоминаний, запись уведомлений и отметка «отправлено» – одна транзакция.
// Блокировки:
// - FOR UPDATE OF rm SKIP LOCKED: несколько экземпляров сервера не возьмут одно напоминание;
// - FOR SHARE OF e, reg SKIP LOCKED: если мероприятие или регистрация сейчас изменяются
//   (перенос, отмена мероприятия, отмена участия держат FOR UPDATE), напоминание пропускается до
//   следующего прохода и затем проверяется по зафиксированному состоянию.
// Условия: мероприятие опубликовано, регистрация активна, версия расписания совпадает.
// Возвращает id созданных уведомлений (отправка в Socket.IO – после фиксации)
const takeDue = (now = new Date(), batch = 100) => sequelize.transaction(async (transaction) => {
    // наступившие напоминания, которые отправлять уже не нужно, помечаются skipped:
    // пользователь заблокирован или деактивирован (после возврата аккаунта старые напоминания не приходят задним числом)
    // либо мероприятие уже началось (например, сервер не работал в момент отправки)
    await sequelize.query(
        `UPDATE reminders rm SET status = 'skipped', updated_at = now(),
             cancel_reason = CASE WHEN u.blocked OR u.status <> 'active' THEN 'user_inactive' ELSE 'event_started' END
         FROM users u, events e
         WHERE rm.user_id = u.id AND rm.event_id = e.id AND rm.status = 'pending' AND rm.remind_at <= :now
           AND (u.blocked OR u.status <> 'active' OR e.starts_at <= :now)`,
        { replacements: { now }, transaction }
    );
    const due = await sequelize.query(
        `SELECT rm.id, rm.user_id, rm.event_id, rm.registration_id, rm.offset_minutes, rm.schedule_version
         FROM reminders rm
         JOIN events e ON e.id = rm.event_id
         JOIN registrations reg ON reg.id = rm.registration_id
         JOIN users u ON u.id = rm.user_id
         WHERE rm.status = 'pending' AND rm.remind_at <= :now
           AND e.status = 'published' AND reg.status <> 'cancelled' AND e.starts_at > :now
           AND u.status = 'active' AND NOT u.blocked
           AND rm.schedule_version = e.schedule_version
         ORDER BY rm.remind_at, rm.id
         LIMIT :batch
         FOR UPDATE OF rm SKIP LOCKED
         FOR SHARE OF e, reg SKIP LOCKED`,
        { replacements: { now, batch }, type: QueryTypes.SELECT, transaction }
    );
    if (!due.length) return [];
    await sequelize.query(
        `UPDATE reminders SET status = 'sent', sent_at = :now, updated_at = now() WHERE id IN (:ids)`,
        { replacements: { now, ids: due.map((r) => r.id) }, transaction }
    );
    const rows = await sequelize.query(
        `INSERT INTO notifications (user_id, type, event_id, registration_id, reminder_id, payload, dedup_key)
         SELECT d.user_id, 'reminder', d.event_id, d.registration_id, d.id,
                jsonb_build_object('offsetMinutes', d.offset_minutes, 'scheduleVersion', d.schedule_version),
                'reminder:' || d.id || ':v' || d.schedule_version
         FROM jsonb_to_recordset(CAST(:due AS jsonb))
              AS d(id bigint, user_id bigint, event_id bigint, registration_id bigint, offset_minutes int, schedule_version int)
         ON CONFLICT (user_id, dedup_key) DO NOTHING
         RETURNING id`,
        { replacements: { due: JSON.stringify(due) }, type: QueryTypes.SELECT, transaction }
    );
    return rows.map((r) => r.id);
});

module.exports = {
    createAuto, create, list, update, remove,
    rescheduleForEvent, cancelForRegistration, cancelForEvent, takeDue, remindAtFor
};

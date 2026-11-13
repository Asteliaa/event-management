const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const { sequelize, User, Event } = require('../models');
const ApiError = require('../utils/ApiError');
const notify = require('../socket/notify');

// Три разных действия с аккаунтом:
// 1. Блокировка (администратор) – обратимая мера: вход и запросы запрещены, данные не меняются.
// 2. Деактивация (сам пользователь или администратор) – обратимая: данные и регистрации сохраняются,
//    напоминания не отправляются, вход запрещен; деактивацию самим пользователем отменяет вход с паролем,
//    деактивацию администратором – только администратор.
// 3. Удаление – необратимая очистка идентифицирующих данных (см. anonymize), строка users остается,
//    чтобы история регистраций, мероприятий и чатов не удалялась каскадом.
// Во всех случаях token_version увеличивается: выданные JWT и открытые сокеты перестают действовать.

const lockUser = async (id, transaction) => {
    const user = await User.scope('withPassword').findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user || user.status === 'deleted') throw ApiError.notFound('Пользователь не найден');
    return user;
};

const assertNotSelf = (id, currentUser, message) => {
    if (String(id) === String(currentUser.id)) throw ApiError.badRequest(message);
};

const assertPassword = async (user, password) => {
    if (!password || !await bcrypt.compare(password, user.passwordHash)) {
        throw ApiError.badRequest('Пароль указан неверно');
    }
};

// --- блокировка и роль (администратор) ---
const updateByAdmin = async (id, { role, blocked }, currentUser) => {
    assertNotSelf(id, currentUser, 'Нельзя изменить роль или заблокировать самого себя');
    const user = await sequelize.transaction(async (transaction) => {
        const u = await lockUser(id, transaction);
        const changes = {};
        if (role !== undefined && role !== u.role) changes.role = role;
        if (blocked !== undefined && blocked !== u.blocked) Object.assign(changes, { blocked, blockedAt: blocked ? new Date() : null });
        if (Object.keys(changes).length) {
            // смена роли или блокировка: старые токены и соединения с прежними правами завершаются
            changes.tokenVersion = u.tokenVersion + 1;
            await u.update(changes, { transaction });
        }
        return u;
    });
    notify.disconnectUser(user.id);
    return User.findByPk(user.id);
};

// --- деактивация ---
const deactivate = async (user, by, transaction) => {
    if (user.status === 'deactivated') return;
    await user.update({
        status: 'deactivated', deactivatedAt: new Date(), deactivatedBy: by, tokenVersion: user.tokenVersion + 1
    }, { transaction });
};

const deactivateSelf = async (userId, { password }) => {
    await sequelize.transaction(async (transaction) => {
        const user = await lockUser(userId, transaction);
        await assertPassword(user, password);
        await deactivate(user, 'user', transaction);
    });
    notify.disconnectUser(userId);
};

const deactivateByAdmin = async (id, currentUser) => {
    assertNotSelf(id, currentUser, 'Нельзя деактивировать самого себя');
    await sequelize.transaction(async (transaction) => deactivate(await lockUser(id, transaction), 'admin', transaction));
    notify.disconnectUser(id);
    return User.findByPk(id);
};

const reactivateByAdmin = async (id) => {
    await sequelize.transaction(async (transaction) => {
        const user = await lockUser(id, transaction);
        if (user.status === 'deactivated') {
            await user.update({ status: 'active', deactivatedAt: null, deactivatedBy: null }, { transaction });
        }
    });
    return User.findByPk(id);
};

// --- удаление с обезличиванием ---
//
// Что очищается:
// - users: имя → «Удаленный пользователь», email и город → NULL, хеш пароля → случайный (вход невозможен),
//   роль → user, блокировка снимается, status = deleted, token_version + 1 (токены и сокеты недействительны);
// - messages: автор → «Удаленный пользователь», текст → «Сообщение удалено» (текст мог содержать личные данные);
// - registrations: комментарий очищается; будущие активные регистрации отменяются (cancelled_by = system),
//   места освобождаются; прошедшие остаются в истории (статистика мероприятий не искажается);
// - reminders: ожидающие отменяются;
// - notifications и favorites пользователя удаляются;
// - черновики пользователя без регистраций удаляются.
// Что остается: строка users (id) как ссылка для истории, прошедшие и отмененные мероприятия организатора.
// В payload уведомлений других пользователей личных данных нет (там только id). Не покрываются:
// резервные копии БД и журналы внешних систем.
//
// Организатора с будущими опубликованными мероприятиями удалить нельзя, пока они не переданы или не отменены.
const anonymize = async (user, transaction) => {
    const id = user.id;
    const [{ count }] = await sequelize.query(
        `SELECT count(*)::int AS count FROM events
         WHERE organizer_id = :id AND status = 'published' AND coalesce(ends_at, starts_at) > now()`,
        { replacements: { id }, type: QueryTypes.SELECT, transaction }
    );
    if (count > 0) {
        throw ApiError.conflict(
            `У пользователя есть будущие опубликованные мероприятия (${count}): передайте их другому организатору или отмените`,
            'ORGANIZER_HAS_FUTURE_EVENTS'
        );
    }

    // будущие активные регистрации: отмена с освобождением мест (счетчик меняется в той же транзакции)
    const future = await sequelize.query(
        `UPDATE registrations r SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', updated_at = now()
         FROM events e
         WHERE r.event_id = e.id AND r.user_id = :id AND r.status = 'registered'
           AND e.status = 'published' AND e.starts_at > now()
         RETURNING r.id, r.event_id`,
        { replacements: { id }, type: QueryTypes.SELECT, transaction }
    );
    if (future.length) {
        await sequelize.query(
            `UPDATE events e SET seats_taken = e.seats_taken - c.seats, updated_at = now()
             FROM (SELECT event_id, count(*)::int AS seats FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS x(id bigint, event_id bigint)
                   GROUP BY event_id) c
             WHERE e.id = c.event_id`,
            { replacements: { rows: JSON.stringify(future) }, transaction }
        );
    }
    const q = (sql) => sequelize.query(sql, { replacements: { id, name: User.DELETED_NAME }, transaction });
    await q(`UPDATE registrations SET comment = '', updated_at = now() WHERE user_id = :id AND comment <> ''`);
    await q(`UPDATE reminders SET status = 'cancelled', cancel_reason = 'account_deleted', updated_at = now()
             WHERE user_id = :id AND status = 'pending'`);
    await q('DELETE FROM notifications WHERE user_id = :id');
    await q('DELETE FROM favorites WHERE user_id = :id');
    await q(`UPDATE messages SET author = :name, text = 'Сообщение удалено', deleted_at = now() WHERE user_id = :id`);
    await q(`DELETE FROM events e WHERE e.organizer_id = :id AND e.status = 'draft'
             AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.event_id = e.id)`);
    await user.update({
        name: User.DELETED_NAME,
        email: null,
        city: null,
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 4),
        role: 'user',
        blocked: false,
        blockedAt: null,
        status: 'deleted',
        deletedAt: new Date(),
        deactivatedAt: null,
        deactivatedBy: null,
        tokenVersion: user.tokenVersion + 1
    }, { transaction });
    return future.map((r) => r.event_id);
};

const finishDeletion = (userId, eventIds) => {
    notify.disconnectUser(userId);
    for (const eventId of eventIds) notify.revokeChat(userId, eventId, 'account_deleted');
};

const deleteSelf = async (userId, { password }) => {
    const eventIds = await sequelize.transaction(async (transaction) => {
        const user = await lockUser(userId, transaction);
        await assertPassword(user, password);
        return anonymize(user, transaction);
    });
    finishDeletion(userId, eventIds);
};

const deleteByAdmin = async (id, currentUser) => {
    assertNotSelf(id, currentUser, 'Нельзя удалить самого себя');
    const eventIds = await sequelize.transaction(async (transaction) => anonymize(await lockUser(id, transaction), transaction));
    finishDeletion(id, eventIds);
};

// Есть ли у пользователя будущие опубликованные мероприятия (для подсказки в интерфейсе)
const futureEventsCount = (userId) => Event.count({
    where: { organizerId: userId, status: 'published', startsAt: { [Op.gt]: new Date() } }
});

module.exports = {
    updateByAdmin, deactivateSelf, deactivateByAdmin, reactivateByAdmin, deleteSelf, deleteByAdmin, futureEventsCount
};

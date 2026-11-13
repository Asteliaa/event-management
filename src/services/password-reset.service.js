const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { QueryTypes } = require('sequelize');
const { sequelize, User } = require('../models');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const mail = require('./mail.service');
const notify = require('../socket/notify');

// Восстановление пароля.
// - Запрос: одинаковый ответ для любого адреса; письмо получает только аккаунт, которому восстановление
//   разрешено (активный или деактивированный самим пользователем, не заблокированный и не удаленный).
// - Токен: 256 бит из CSPRNG, в БД – только SHA-256 хеш, срок 30 минут, одноразовый;
//   новый запрос отзывает прежние токены, смена или сброс пароля отзывают все.
// - Сброс: погашение токена и смена пароля – одна транзакция; условный UPDATE гарантирует, что из
//   двух параллельных сбросов одним токеном успешен только один. После сброса token_version
//   увеличивается: все JWT и Socket.IO-соединения перестают действовать. Сброс не активирует
//   деактивированный аккаунт – это делает последующий вход по существующему правилу.

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const canRecover = (user) => Boolean(user) && !user.blocked
    && (user.status === 'active' || (user.status === 'deactivated' && user.deactivatedBy === 'user'));

const invalidToken = () => new ApiError(400, 'Ссылка для сброса пароля недействительна или устарела. Запросите новую', {
    code: 'INVALID_RESET_TOKEN'
});

const revokeAll = (userId, transaction) => sequelize.query(
    `UPDATE password_reset_tokens SET revoked_at = now()
     WHERE user_id = :userId AND used_at IS NULL AND revoked_at IS NULL`,
    { replacements: { userId }, transaction }
);

const resetMessage = (user, token) => ({
    to: user.email,
    subject: 'EventHub: восстановление пароля',
    text: [
        `Здравствуйте, ${user.name}!`,
        '',
        'Кто-то (возможно, вы) запросил сброс пароля для вашей учетной записи EventHub.',
        `Чтобы задать новый пароль, откройте ссылку в течение ${config.passwordReset.ttlMinutes} минут:`,
        // токен – во фрагменте (#): браузер не отправляет его на сервер и в заголовке Referer
        `${config.appUrl}/reset-password#token=${token}`,
        '',
        'Ссылка одноразовая. Если вы не запрашивали сброс, просто проигнорируйте письмо – пароль не изменится.'
    ].join('\n')
});

const changedMessage = (user) => ({
    to: user.email,
    subject: 'EventHub: пароль изменен',
    text: [
        `Здравствуйте, ${user.name}!`,
        '',
        'Пароль вашей учетной записи EventHub был изменен через восстановление доступа.',
        'Все сеансы на других устройствах завершены.',
        '',
        'Если это были не вы, срочно восстановите доступ еще раз и обратитесь к администратору.'
    ].join('\n')
});

// Возвращает { delivery } – промис фоновой работы (null, если письмо не положено). API его не ждет:
// выпуск токена и отправка письма идут после ответа, поэтому время ответа почти не зависит от того,
// существует ли аккаунт, а сбой БД или почты не меняет ответ
const requestReset = async ({ email }) => {
    const user = await User.findOne({ where: { email } });
    if (!canRecover(user)) return { delivery: null };
    return { delivery: issueAndSend(user).catch((err) => {
        if (!config.isTest) console.error(`Токен восстановления не выдан: ${err.code || err.name}`);
    }) };
};

const issueAndSend = async (user) => {
    const token = crypto.randomBytes(32).toString('base64url');
    await sequelize.transaction(async (transaction) => {
        // блокировка строки пользователя: параллельные запросы выполняются по очереди
        // и в итоге остается один действующий токен
        await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE, attributes: ['id'] });
        await revokeAll(user.id, transaction);
        await sequelize.query(
            `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
             VALUES (:userId, :hash, now() + make_interval(mins => :ttl))`,
            { replacements: { userId: user.id, hash: hashToken(token), ttl: config.passwordReset.ttlMinutes }, transaction }
        );
    });
    await mail.sendInBackground(resetMessage(user, token), 'восстановление пароля');
};

const resetPassword = async ({ token, password }) => {
    // хеш пароля – до транзакции: блокировки не держатся во время bcrypt
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const user = await sequelize.transaction(async (transaction) => {
        const rows = await sequelize.query(
            `UPDATE password_reset_tokens SET used_at = now()
             WHERE token_hash = :hash AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
             RETURNING user_id`,
            { replacements: { hash: hashToken(token) }, type: QueryTypes.SELECT, transaction }
        );
        if (!rows.length) throw invalidToken();
        const u = await User.findByPk(rows[0].user_id, { transaction, lock: transaction.LOCK.UPDATE });
        // за время жизни токена аккаунт могли заблокировать, удалить или деактивировать администратором
        if (!canRecover(u)) throw invalidToken();
        await u.update({ passwordHash, tokenVersion: u.tokenVersion + 1 }, { transaction });
        await revokeAll(u.id, transaction);
        return u;
    });
    notify.disconnectUser(user.id);
    return { delivery: mail.sendInBackground(changedMessage(user), 'уведомление о смене пароля') };
};

module.exports = { requestReset, resetPassword, revokeAll, hashToken, canRecover };

// Этап Б3: три разных действия с аккаунтом.
// - Блокировка администратором (blocked, blocked_at): обратима, вход и запросы запрещены.
// - Деактивация (status = deactivated): обратима, данные не очищаются; deactivated_by – кто деактивировал
//   (пользователь может вернуть аккаунт входом, деактивированный администратором – только через администратора).
// - Удаление (status = deleted): необратимая очистка идентифицирующих данных (выполняет сервис,
//   строка users остается, чтобы история регистраций и мероприятий не удалялась каскадом).
// token_version увеличивается при блокировке, деактивации, удалении и смене пароля – ранее выданные JWT
// и открытые Socket.IO-соединения перестают действовать.

const up = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`ALTER TABLE users
        ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated', 'deleted')),
        ADD COLUMN blocked_at timestamptz,
        ADD COLUMN deactivated_at timestamptz,
        ADD COLUMN deactivated_by text CHECK (deactivated_by IN ('user', 'admin')),
        ADD COLUMN deleted_at timestamptz,
        ADD COLUMN token_version integer NOT NULL DEFAULT 0`);
    await q('UPDATE users SET blocked_at = updated_at WHERE blocked');
    await q('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
    await q(`ALTER TABLE users
        ADD CONSTRAINT users_email_unless_deleted CHECK (status = 'deleted' OR email IS NOT NULL),
        ADD CONSTRAINT users_deleted_at_check CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),
        ADD CONSTRAINT users_deactivated_check CHECK ((status = 'deactivated') = (deactivated_at IS NOT NULL))`);
    // сообщение удаленного пользователя: текст и автор заменяются, признак удаления – для отображения
    await q('ALTER TABLE messages ADD COLUMN deleted_at timestamptz');
};

const down = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);
    // удаленные (обезличенные) учетные записи не вернуть к прежнему формату с обязательным email
    await q(`UPDATE users SET email = 'deleted-' || id || '@invalid.local' WHERE email IS NULL`);
    await q('ALTER TABLE messages DROP COLUMN deleted_at');
    await q(`ALTER TABLE users DROP CONSTRAINT users_email_unless_deleted, DROP CONSTRAINT users_deleted_at_check,
        DROP CONSTRAINT users_deactivated_check`);
    await q('ALTER TABLE users ALTER COLUMN email SET NOT NULL');
    await q(`ALTER TABLE users DROP COLUMN status, DROP COLUMN blocked_at, DROP COLUMN deactivated_at,
        DROP COLUMN deactivated_by, DROP COLUMN deleted_at, DROP COLUMN token_version`);
};

module.exports = { up, down };

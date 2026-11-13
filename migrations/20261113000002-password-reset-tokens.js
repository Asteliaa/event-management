// Восстановление пароля: одноразовые токены сброса.
// Хранится только SHA-256 хеш токена (сам токен есть только в письме), срок действия, отметки
// использования и отзыва. Новый запрос отзывает прежние токены пользователя; смена или сброс пароля
// отзывает все. Строка users не удаляется физически, поэтому каскад нужен только для целостности.

const up = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(`
        CREATE TABLE password_reset_tokens (
            id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            token_hash char(64)    NOT NULL UNIQUE,
            expires_at timestamptz NOT NULL,
            used_at    timestamptz,
            revoked_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT password_reset_tokens_single_end CHECK (used_at IS NULL OR revoked_at IS NULL)
        )`);
    // поиск действующих токенов пользователя при отзыве
    await queryInterface.sequelize.query(`CREATE INDEX password_reset_tokens_active_idx
        ON password_reset_tokens (user_id) WHERE used_at IS NULL AND revoked_at IS NULL`);
};

const down = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query('DROP TABLE password_reset_tokens');
};

module.exports = { up, down };

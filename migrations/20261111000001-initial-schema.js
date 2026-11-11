// Начальная схема EventHub в PostgreSQL: перенос шести коллекций MongoDB
// (users, categories, events, registrations, reminders, messages) и избранного,
// которое в MongoDB хранилось массивом ссылок в users.favorites.
//
// Соглашения:
// - первичные ключи bigint GENERATED ALWAYS AS IDENTITY, в API передаются строками;
// - моменты времени – timestamptz;
// - перечисления – text + CHECK (проще менять миграциями, чем тип ENUM);
// - инварианты счетчика мест (неотрицательность, не больше вместимости) проверяет сама БД.

const up = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);

    // Сортировка названий по правилам русского языка (кириллица раньше латиницы, как в MongoDB collation ru)
    await q(`CREATE COLLATION IF NOT EXISTS ru_icu (provider = icu, locale = 'ru')`);

    await q(`
        CREATE TABLE users (
            id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name          varchar(80)  NOT NULL CHECK (length(btrim(name)) > 0),
            email         varchar(254) NOT NULL CHECK (email = lower(email)),
            password_hash text         NOT NULL,
            role          text         NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
            city          varchar(80),
            blocked       boolean      NOT NULL DEFAULT false,
            created_at    timestamptz  NOT NULL DEFAULT now(),
            updated_at    timestamptz  NOT NULL DEFAULT now(),
            CONSTRAINT users_email_key UNIQUE (email)
        )`);

    await q(`
        CREATE TABLE categories (
            id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name        varchar(60)  NOT NULL,
            slug        varchar(80)  NOT NULL,
            color       char(7)      NOT NULL DEFAULT '#6366f1' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
            description varchar(300) NOT NULL DEFAULT '',
            created_at  timestamptz  NOT NULL DEFAULT now(),
            updated_at  timestamptz  NOT NULL DEFAULT now(),
            CONSTRAINT categories_name_key UNIQUE (name),
            CONSTRAINT categories_slug_key UNIQUE (slug)
        )`);

    await q(`
        CREATE TABLE events (
            id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            title           varchar(150)  NOT NULL,
            description     varchar(5000) NOT NULL DEFAULT '',
            type            text          NOT NULL CHECK (type IN ('conference', 'webinar', 'meeting')),
            status          text          NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'cancelled')),
            category_id     bigint        REFERENCES categories (id) ON DELETE SET NULL,
            organizer_id    bigint        REFERENCES users (id) ON DELETE SET NULL,
            starts_at       timestamptz   NOT NULL,
            ends_at         timestamptz,
            cover_url       text          NOT NULL DEFAULT '',
            capacity        integer,
            seats_taken     integer       NOT NULL DEFAULT 0,
            location_city   varchar(80),
            location_venue  varchar(150),
            location_online boolean       NOT NULL DEFAULT false,
            location_url    text,
            tags            text[]        NOT NULL DEFAULT '{}',
            created_at      timestamptz   NOT NULL DEFAULT now(),
            updated_at      timestamptz   NOT NULL DEFAULT now(),
            CONSTRAINT events_ends_after_start CHECK (ends_at IS NULL OR ends_at > starts_at),
            CONSTRAINT events_capacity_positive CHECK (capacity IS NULL OR capacity >= 1),
            CONSTRAINT events_seats_non_negative CHECK (seats_taken >= 0),
            CONSTRAINT events_seats_within_capacity CHECK (capacity IS NULL OR seats_taken <= capacity)
        )`);
    await q('CREATE INDEX events_starts_at_idx ON events (starts_at)');
    await q('CREATE INDEX events_category_starts_at_idx ON events (category_id, starts_at)');
    await q('CREATE INDEX events_organizer_idx ON events (organizer_id)');
    await q('CREATE INDEX events_tags_idx ON events USING gin (tags)');

    await q(`
        CREATE TABLE registrations (
            id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            event_id   bigint       NOT NULL REFERENCES events (id) ON DELETE CASCADE,
            user_id    bigint       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            tickets    smallint     NOT NULL DEFAULT 1 CHECK (tickets BETWEEN 1 AND 10),
            status     text         NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'cancelled')),
            comment    varchar(300) NOT NULL DEFAULT '',
            created_at timestamptz  NOT NULL DEFAULT now(),
            updated_at timestamptz  NOT NULL DEFAULT now(),
            -- текущее поведение: одна запись на пару (мероприятие, пользователь), повторная запись реактивирует ее
            CONSTRAINT registrations_event_user_key UNIQUE (event_id, user_id)
        )`);
    await q('CREATE INDEX registrations_user_created_idx ON registrations (user_id, created_at DESC)');

    await q(`
        CREATE TABLE reminders (
            id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id        bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            event_id       bigint      NOT NULL REFERENCES events (id) ON DELETE CASCADE,
            offset_minutes integer     NOT NULL CHECK (offset_minutes BETWEEN 0 AND 43200),
            remind_at      timestamptz NOT NULL,
            kind           text        NOT NULL DEFAULT 'custom' CHECK (kind IN ('auto', 'custom')),
            status         text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
            sent_at        timestamptz,
            read_at        timestamptz,
            created_at     timestamptz NOT NULL DEFAULT now(),
            updated_at     timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT reminders_user_event_offset_key UNIQUE (user_id, event_id, offset_minutes)
        )`);
    // планировщик выбирает только неотправленные – частичный индекс
    await q(`CREATE INDEX reminders_pending_remind_at_idx ON reminders (remind_at) WHERE status = 'pending'`);
    await q('CREATE INDEX reminders_event_idx ON reminders (event_id)');

    await q(`
        CREATE TABLE messages (
            id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            event_id   bigint       NOT NULL REFERENCES events (id) ON DELETE CASCADE,
            -- при удалении пользователя его сообщения остаются в истории (с сохраненным именем автора)
            user_id    bigint       REFERENCES users (id) ON DELETE SET NULL,
            author     varchar(80)  NOT NULL,
            text       varchar(500) NOT NULL CHECK (length(btrim(text)) > 0),
            created_at timestamptz  NOT NULL DEFAULT now()
        )`);
    await q('CREATE INDEX messages_event_created_idx ON messages (event_id, created_at DESC, id DESC)');

    await q(`
        CREATE TABLE favorites (
            user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            event_id   bigint      NOT NULL REFERENCES events (id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, event_id)
        )`);
    await q('CREATE INDEX favorites_event_idx ON favorites (event_id)');
};

const down = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);
    for (const table of ['favorites', 'messages', 'reminders', 'registrations', 'events', 'categories', 'users']) {
        await q(`DROP TABLE IF EXISTS ${table}`);
    }
    await q('DROP COLLATION IF EXISTS ru_icu');
};

module.exports = { up, down };

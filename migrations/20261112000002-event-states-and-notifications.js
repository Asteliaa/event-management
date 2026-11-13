// Этап Б2: разделенные состояния мероприятия, расписание с версией и история уведомлений.
//
// events:
// - публикация: status draft / published / cancelled (черновик может быть неполным: starts_at допускает NULL);
// - доступность регистрации: registration_open + registration_deadline (независимо от публикации);
// - временная фаза (до начала / идет / завершено) не хранится – вычисляется по starts_at и ends_at;
// - timezone – IANA-пояс мероприятия (моменты времени по-прежнему timestamptz);
// - schedule_version увеличивается только при изменении начала или окончания: смена места
//   или описания не трогает напоминания;
// - published_at, cancelled_at, cancel_reason.
// reminders.schedule_version – версия расписания, для которой рассчитано напоминание.
// notifications – история уведомлений пользователя (прочтение, пагинация). Socket.IO только ускоряет
// доставку. dedup_key уникален в пределах пользователя: повторная обработка не создает дубликат.
// Отправленные напоминания переносятся в notifications (вместе с отметкой о прочтении), reminders.read_at удаляется.
//
// Существующим мероприятиям (данные этапа А – демонстрационные, по Минску) присваивается пояс Europe/Minsk;
// новые мероприятия передают пояс явно.

const up = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);

    // --- events ---
    await q('ALTER TABLE events DROP CONSTRAINT events_status_check');
    await q(`ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN ('draft', 'published', 'cancelled'))`);
    await q(`ALTER TABLE events ALTER COLUMN status SET DEFAULT 'draft'`);
    await q('ALTER TABLE events ALTER COLUMN starts_at DROP NOT NULL');
    await q(`ALTER TABLE events
        ADD COLUMN timezone text,
        ADD COLUMN registration_open boolean NOT NULL DEFAULT true,
        ADD COLUMN registration_deadline timestamptz,
        ADD COLUMN schedule_version integer NOT NULL DEFAULT 1 CHECK (schedule_version >= 1),
        ADD COLUMN published_at timestamptz,
        ADD COLUMN cancelled_at timestamptz,
        ADD COLUMN cancel_reason varchar(500)`);
    await q(`UPDATE events SET timezone = 'Europe/Minsk'`);
    await q('ALTER TABLE events ALTER COLUMN timezone SET NOT NULL');
    await q(`UPDATE events SET published_at = created_at WHERE status IN ('published', 'cancelled')`);
    await q(`UPDATE events SET cancelled_at = updated_at WHERE status = 'cancelled'`);
    await q(`ALTER TABLE events
        ADD CONSTRAINT events_dates_unless_draft CHECK (status = 'draft' OR starts_at IS NOT NULL),
        ADD CONSTRAINT events_deadline_before_start CHECK (
            registration_deadline IS NULL OR starts_at IS NULL OR registration_deadline <= starts_at),
        ADD CONSTRAINT events_cancelled_at_check CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))`);
    await q('CREATE INDEX events_status_starts_at_idx ON events (status, starts_at)');

    // --- reminders ---
    await q('ALTER TABLE reminders ADD COLUMN schedule_version integer NOT NULL DEFAULT 1');

    // --- notifications ---
    await q(`
        CREATE TABLE notifications (
            id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id         bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            type            text        NOT NULL CHECK (type IN (
                                'reminder', 'event_rescheduled', 'event_location_changed', 'event_cancelled',
                                'registration_cancelled')),
            event_id        bigint      REFERENCES events (id) ON DELETE SET NULL,
            registration_id bigint      REFERENCES registrations (id) ON DELETE SET NULL,
            reminder_id     bigint      REFERENCES reminders (id) ON DELETE SET NULL,
            -- только идентификаторы и неперсональные значения (время, версия расписания);
            -- без имен, email и ссылки подключения
            payload         jsonb       NOT NULL DEFAULT '{}',
            dedup_key       text        NOT NULL,
            read_at         timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT notifications_user_dedup_key UNIQUE (user_id, dedup_key)
        )`);
    await q('CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC, id DESC)');
    await q('CREATE INDEX notifications_user_unread_idx ON notifications (user_id) WHERE read_at IS NULL');

    // история отправленных напоминаний → notifications
    await q(`INSERT INTO notifications (user_id, type, event_id, registration_id, reminder_id, payload, dedup_key, read_at, created_at)
        SELECT user_id, 'reminder', event_id, registration_id, id,
               jsonb_build_object('offsetMinutes', offset_minutes, 'scheduleVersion', 1),
               'reminder:' || id || ':v1', read_at, coalesce(sent_at, updated_at)
        FROM reminders WHERE status = 'sent'`);
    await q('ALTER TABLE reminders DROP COLUMN read_at');
};

const down = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('ALTER TABLE reminders ADD COLUMN read_at timestamptz');
    await q(`UPDATE reminders r SET read_at = n.read_at FROM notifications n
        WHERE n.reminder_id = r.id AND n.type = 'reminder' AND n.read_at IS NOT NULL`);
    await q('DROP TABLE notifications');
    await q('ALTER TABLE reminders DROP COLUMN schedule_version');

    // черновики не существовали до этапа Б2: откат невозможен, пока они есть
    await q('DROP INDEX events_status_starts_at_idx');
    await q(`ALTER TABLE events DROP CONSTRAINT events_dates_unless_draft,
        DROP CONSTRAINT events_deadline_before_start, DROP CONSTRAINT events_cancelled_at_check`);
    await q(`ALTER TABLE events DROP COLUMN timezone, DROP COLUMN registration_open, DROP COLUMN registration_deadline,
        DROP COLUMN schedule_version, DROP COLUMN published_at, DROP COLUMN cancelled_at, DROP COLUMN cancel_reason`);
    await q('ALTER TABLE events ALTER COLUMN starts_at SET NOT NULL');
    await q(`ALTER TABLE events ALTER COLUMN status SET DEFAULT 'published'`);
    await q('ALTER TABLE events DROP CONSTRAINT events_status_check');
    await q(`ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN ('published', 'cancelled'))`);
};

module.exports = { up, down };

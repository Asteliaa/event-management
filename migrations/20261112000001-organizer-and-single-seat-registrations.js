// Этап Б1: облегченный организатор и модель «одна регистрация = одно место».
//
// 1. Роль organizer: выдает администратор, организатор управляет своими мероприятиями (events.organizer_id).
// 2. Регистрации:
//    - число билетов больше не используется. Значение не удаляется, а сохраняется в legacy_tickets
//      (только у регистраций, созданных до этой миграции), чтобы переход был прозрачным и обратимым;
//    - вместо UNIQUE (event_id, user_id) – частичный уникальный индекс по неотмененным регистрациям:
//      активной может быть только одна, а повторная запись после отмены создает новую строку (история сохраняется);
//    - cancelled_at / cancelled_by – когда и кем отменена регистрация;
//    - seats_taken пересчитывается как число активных регистраций.
// 3. Напоминания привязываются к конкретной регистрации (registration_id). Ключ уникальности –
//    (registration_id, offset_minutes). Неотправленные напоминания без активной регистрации
//    переводятся в статус cancelled (не удаляются).

const up = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);

    // --- роли ---
    await q('ALTER TABLE users DROP CONSTRAINT users_role_check');
    await q(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'organizer', 'admin'))`);

    // --- регистрации ---
    await q('ALTER TABLE registrations RENAME COLUMN tickets TO legacy_tickets');
    await q('ALTER TABLE registrations ALTER COLUMN legacy_tickets DROP NOT NULL');
    await q('ALTER TABLE registrations ALTER COLUMN legacy_tickets DROP DEFAULT');
    await q(`COMMENT ON COLUMN registrations.legacy_tickets IS
        'Число билетов в регистрации, созданной до перехода на модель «одна регистрация – одно место». У новых регистраций NULL'`);
    await q(`ALTER TABLE registrations
        ADD COLUMN cancelled_at timestamptz,
        ADD COLUMN cancelled_by text CHECK (cancelled_by IN ('user', 'organizer', 'admin', 'system'))`);
    // у отмененных до миграции регистраций точное время отмены неизвестно – берем время последнего изменения
    await q(`UPDATE registrations SET cancelled_at = updated_at WHERE status = 'cancelled'`);
    await q(`ALTER TABLE registrations ADD CONSTRAINT registrations_cancelled_at_check
        CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))`);
    await q('ALTER TABLE registrations DROP CONSTRAINT registrations_event_user_key');
    await q(`CREATE UNIQUE INDEX registrations_active_event_user_key
        ON registrations (event_id, user_id) WHERE status <> 'cancelled'`);
    await q('CREATE INDEX registrations_event_status_idx ON registrations (event_id, status)');

    // счетчик мест = число активных регистраций
    await q(`UPDATE events e SET seats_taken = coalesce(r.cnt, 0)
        FROM (SELECT ev.id, count(reg.id) FILTER (WHERE reg.status <> 'cancelled')::int AS cnt
              FROM events ev LEFT JOIN registrations reg ON reg.event_id = ev.id GROUP BY ev.id) r
        WHERE e.id = r.id AND e.seats_taken <> coalesce(r.cnt, 0)`);

    // --- напоминания ---
    await q(`ALTER TABLE reminders
        ADD COLUMN registration_id bigint REFERENCES registrations (id) ON DELETE CASCADE,
        ADD COLUMN cancel_reason text`);
    await q('ALTER TABLE reminders DROP CONSTRAINT reminders_status_check');
    await q(`ALTER TABLE reminders ADD CONSTRAINT reminders_status_check
        CHECK (status IN ('pending', 'sent', 'cancelled', 'skipped'))`);
    // привязка к активной регистрации того же пользователя на то же мероприятие
    await q(`UPDATE reminders rm SET registration_id = reg.id
        FROM registrations reg
        WHERE reg.event_id = rm.event_id AND reg.user_id = rm.user_id AND reg.status <> 'cancelled'`);
    // прежняя версия разрешала свои напоминания без регистрации; такие ожидающие напоминания отменяются
    await q(`UPDATE reminders SET status = 'cancelled', cancel_reason = 'no_registration', updated_at = now()
        WHERE registration_id IS NULL AND status = 'pending'`);
    await q('ALTER TABLE reminders DROP CONSTRAINT reminders_user_event_offset_key');
    await q(`CREATE UNIQUE INDEX reminders_registration_offset_key
        ON reminders (registration_id, offset_minutes) WHERE status <> 'cancelled'`);
    await q('CREATE INDEX reminders_registration_idx ON reminders (registration_id)');
    // новое ожидающее напоминание обязано относиться к регистрации
    await q(`ALTER TABLE reminders ADD CONSTRAINT reminders_pending_has_registration
        CHECK (status <> 'pending' OR registration_id IS NOT NULL)`);
};

const down = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);
    // откат возможен, пока у пользователя нет нескольких регистраций на одно мероприятие
    // (их не уложить обратно в UNIQUE (event_id, user_id)) – в этом случае миграция прервется с ошибкой
    await q('ALTER TABLE reminders DROP CONSTRAINT reminders_pending_has_registration');
    await q('DROP INDEX reminders_registration_offset_key');
    await q(`UPDATE reminders SET status = 'pending', cancel_reason = NULL WHERE cancel_reason = 'no_registration'`);
    await q(`DELETE FROM reminders WHERE status IN ('cancelled', 'skipped')`);
    await q(`ALTER TABLE reminders ADD CONSTRAINT reminders_user_event_offset_key UNIQUE (user_id, event_id, offset_minutes)`);
    await q('ALTER TABLE reminders DROP CONSTRAINT reminders_status_check');
    await q(`ALTER TABLE reminders ADD CONSTRAINT reminders_status_check CHECK (status IN ('pending', 'sent'))`);
    await q('ALTER TABLE reminders DROP COLUMN registration_id, DROP COLUMN cancel_reason');

    await q('DROP INDEX registrations_event_status_idx');
    await q('DROP INDEX registrations_active_event_user_key');
    await q('ALTER TABLE registrations ADD CONSTRAINT registrations_event_user_key UNIQUE (event_id, user_id)');
    await q('ALTER TABLE registrations DROP CONSTRAINT registrations_cancelled_at_check');
    await q('ALTER TABLE registrations DROP COLUMN cancelled_at, DROP COLUMN cancelled_by');
    await q('UPDATE registrations SET legacy_tickets = 1 WHERE legacy_tickets IS NULL');
    await q('ALTER TABLE registrations ALTER COLUMN legacy_tickets SET DEFAULT 1');
    await q('ALTER TABLE registrations ALTER COLUMN legacy_tickets SET NOT NULL');
    await q('ALTER TABLE registrations RENAME COLUMN legacy_tickets TO tickets');
    await q(`UPDATE events e SET seats_taken = coalesce(r.t, 0)
        FROM (SELECT ev.id, sum(reg.tickets) FILTER (WHERE reg.status <> 'cancelled')::int AS t
              FROM events ev LEFT JOIN registrations reg ON reg.event_id = ev.id GROUP BY ev.id) r
        WHERE e.id = r.id`);

    await q(`UPDATE users SET role = 'user' WHERE role = 'organizer'`);
    await q('ALTER TABLE users DROP CONSTRAINT users_role_check');
    await q(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'))`);
};

module.exports = { up, down };

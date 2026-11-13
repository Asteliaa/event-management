// Завершение функциональных сценариев: посещение хранится отдельно от статуса регистрации.
// - attended – отметка о посещении (ставит организатор мероприятия или администратор с момента начала,
//   ее можно исправить); attendance_marked_at / attendance_marked_by – когда и кем поставлена или снята.
//   Статус регистрации теперь только registered | cancelled: неявку не оформляют отменой.
// - cancel_reason – причина, которую указывает организатор или администратор при отмене участия.
// Прежний статус attended переносится в registered + attended = true; откат возвращает его.

const up = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`ALTER TABLE registrations
        ADD COLUMN attended boolean NOT NULL DEFAULT false,
        ADD COLUMN attendance_marked_at timestamptz,
        ADD COLUMN attendance_marked_by bigint REFERENCES users (id) ON DELETE SET NULL,
        ADD COLUMN cancel_reason varchar(500)`);
    await q(`UPDATE registrations SET attended = true, attendance_marked_at = updated_at, status = 'registered'
             WHERE status = 'attended'`);
    await q('ALTER TABLE registrations DROP CONSTRAINT registrations_status_check');
    await q(`ALTER TABLE registrations
        ADD CONSTRAINT registrations_status_check CHECK (status IN ('registered', 'cancelled')),
        ADD CONSTRAINT registrations_attendance_check CHECK (NOT attended OR (status = 'registered' AND attendance_marked_at IS NOT NULL))`);
};

const down = async ({ context: queryInterface }) => {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`ALTER TABLE registrations DROP CONSTRAINT registrations_attendance_check,
        DROP CONSTRAINT registrations_status_check`);
    await q(`UPDATE registrations SET status = 'attended' WHERE attended`);
    await q(`ALTER TABLE registrations
        ADD CONSTRAINT registrations_status_check CHECK (status IN ('registered', 'attended', 'cancelled'))`);
    // причина отмены и автор отметки в прежней схеме не хранятся
    await q(`ALTER TABLE registrations DROP COLUMN attended, DROP COLUMN attendance_marked_at,
        DROP COLUMN attendance_marked_by, DROP COLUMN cancel_reason`);
};

module.exports = { up, down };

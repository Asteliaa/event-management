const config = require('../config');
const reminderService = require('../services/reminder.service');
const notify = require('../socket/notify');

// Планировщик напоминаний: раз в intervalMs выбирает наступившие напоминания
// и отправляет каждое в личную комнату пользователя (все его вкладки) через Socket.IO.
// Если пользователь не в сети, напоминание остается в центре уведомлений (status: sent, без readAt)
const runOnce = async (now = new Date()) => {
    const due = await reminderService.takeDue(now);
    for (const reminder of due) {
        notify.toRooms([notify.rooms.user(reminder.user.toString())], 'reminder:due', reminder.toJSON());
    }
    return due.length;
};

const start = (intervalMs = config.reminders.intervalMs) => {
    let running = false;
    const tick = async () => {
        if (running) return;          // предыдущий проход еще не завершен
        running = true;
        try {
            const sent = await runOnce();
            if (sent && !config.isTest) console.log(`Напоминаний отправлено: ${sent}`);
        } catch (err) {
            console.error('Ошибка планировщика напоминаний:', err.message);
        } finally {
            running = false;
        }
    };
    const timer = setInterval(tick, intervalMs);
    timer.unref();                    // таймер не мешает завершению процесса
    tick();
    return () => clearInterval(timer);
};

module.exports = { start, runOnce };

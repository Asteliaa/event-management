const config = require('../config');
const reminderService = require('../services/reminder.service');
const notificationService = require('../services/notification.service');

// Планировщик напоминаний: раз в intervalMs в одной транзакции выбирает наступившие напоминания,
// записывает уведомления и помечает напоминания отправленными; после фиксации отправляет уведомления
// в личные комнаты пользователей (все вкладки) событием notification:new.
// Если пользователь не в сети или отправка в сокет не удалась, уведомление остается в истории
const runOnce = async (now = new Date()) => {
    const ids = await reminderService.takeDue(now);
    await notificationService.deliver(ids);
    return ids.length;
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

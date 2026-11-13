const nodemailer = require('nodemailer');
const config = require('../config');

// Отправка писем через SMTP. Параметры – из окружения (config.mail); в разработке – Mailpit.
// Письма только текстовые; вложения, файлы и внешние URL в содержимом запрещены
let transport = null;
let testTransport = null;

const getTransport = () => {
    if (testTransport) return testTransport;
    if (!config.mail.host) return null;
    transport ??= nodemailer.createTransport({
        host: config.mail.host,
        port: config.mail.port,
        secure: config.mail.secure,
        auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
        // недоступный SMTP не должен держать запрос и соединения долго
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        disableFileAccess: true,
        disableUrlAccess: true
    });
    return transport;
};

const send = async ({ to, subject, text }) => {
    const t = getTransport();
    if (!t) throw Object.assign(new Error('SMTP не настроен (SMTP_HOST)'), { code: 'MAIL_NOT_CONFIGURED' });
    await t.sendMail({ from: config.mail.from, to, subject, text });
};

// Фоновая отправка: результат не влияет на ответ API. В журнал попадает только код ошибки –
// без адреса, темы и текста письма (в тексте может быть ссылка с токеном)
const sendInBackground = (message, purpose) => send(message).catch((err) => {
    if (!config.isTest) console.error(`Письмо не отправлено (${purpose}): ${err.code || err.name || 'ошибка SMTP'}`);
});

// Для тестов: подмена транспорта (null – вернуть обычный)
const setTestTransport = (t) => { testTransport = t; };

module.exports = { send, sendInBackground, setTestTransport };

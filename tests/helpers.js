/** Общие помощники для тестов. */
process.env.NODE_ENV = 'test';
// Журнал запросов тестов – во временной папке, а не в logs/ проекта
const fs = require('fs');
const os = require('os');
const path = require('path');
if (!process.env.LOG_DIR) {
  process.env.LOG_DIR = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pz1-')), 'logs');
}
const { toISODate } = require('../utils/dates');

/** Дата через n дней от сегодня в формате YYYY-MM-DD. */
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Корректные данные формы; поля можно переопределить. */
function validForm(overrides = {}) {
  return {
    title: 'Митап по Node.js',
    type: 'meetup',
    format: 'offline',
    date: daysFromNow(10),
    time: '18:30',
    location: 'Минск, ул. Гикало, 9',
    organizer: 'Сообщество Node.js',
    capacity: '50',
    description: 'Доклады и нетворкинг',
    ...overrides
  };
}

/** Кодирует объект в application/x-www-form-urlencoded (массивы – повтором ключа). */
function encode(obj) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v !== undefined) params.append(k, v);
  }
  return params.toString();
}

module.exports = { daysFromNow, validForm, encode };

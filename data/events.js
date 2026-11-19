/**
 * Хранилище мероприятий в памяти (без базы данных).
 * Глобальный массив events и счетчик идентификаторов.
 * При перезапуске сервера данные возвращаются к начальному набору.
 */

// Максимальное число записей: защита от переполнения памяти
// при многократной отправке формы.
const MAX_EVENTS = 500;

const seed = [
  {
    title: 'Конференция «Веб-технологии 2026»',
    type: 'conference',
    format: 'offline',
    date: '2026-12-12',
    time: '10:00',
    location: 'Минск, ул. П. Бровки, 6, актовый зал',
    capacity: 250,
    organizer: 'Кафедра ИТАС',
    description: 'Доклады о современных фреймворках, архитектуре веб-приложений и опыте внедрения.\nПерерыв на кофе в 12:30.'
  },
  {
    title: 'Вебинар: Middleware в Express.js',
    type: 'webinar',
    format: 'online',
    date: '2026-12-03',
    time: '18:30',
    location: 'Онлайн-трансляция',
    capacity: 500,
    organizer: 'EventHub',
    description: 'Разбор цепочки обработки запроса, обработчиков ошибок и порядка подключения middleware.'
  },
  {
    title: 'Встреча выпускников ФИТУ',
    type: 'meetup',
    format: 'offline',
    date: '2027-01-20',
    time: '19:00',
    location: 'Минск, коворкинг «Точка»',
    capacity: 40,
    organizer: 'Студенческий совет',
    description: 'Неформальная встреча: истории о первой работе и знакомство с выпускниками прошлых лет.'
  },
  {
    title: 'Вебинар: Шаблонизатор EJS на практике',
    type: 'webinar',
    format: 'online',
    date: '2026-12-17',
    time: '17:00',
    location: 'Онлайн-трансляция',
    capacity: 300,
    organizer: 'EventHub',
    description: 'Partials, циклы, условия и передача данных из контроллера в шаблон.'
  }
];

let events = [];
let nextId = 1;

/** Создает запись с новым id и датой добавления. */
function insert(data) {
  const event = { id: nextId++, ...data, createdAt: new Date() };
  events.push(event);
  return event;
}

/** Возвращает массив к начальному состоянию (используется при старте и в тестах). */
function reset() {
  events = [];
  nextId = 1;
  seed.forEach(insert);
}

reset();

module.exports = {
  MAX_EVENTS,
  getAll: () => events,
  findById: (id) => events.find((e) => e.id === id),
  count: () => events.length,
  add: insert,
  reset
};

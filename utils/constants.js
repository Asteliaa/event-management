/** Справочники и ограничения длины полей. */
const EVENT_TYPES = {
  conference: 'Конференция',
  webinar: 'Вебинар',
  meetup: 'Встреча'
};

const EVENT_FORMATS = {
  offline: 'Очно',
  online: 'Онлайн'
};

const LIMITS = {
  title: { max: 120 },
  location: { max: 150 },
  organizer: { max: 80 },
  description: { max: 1000 },
  // maxLength – сколько символов можно ввести в поле количества мест
  capacity: { min: 1, max: 10000, maxLength: 5 },
  search: { max: 100 }
};

module.exports = { EVENT_TYPES, EVENT_FORMATS, LIMITS };

// Типы мероприятий
export const EVENT_TYPES = {
  conference: 'Конференция',
  webinar: 'Вебинар',
  meeting: 'Встреча',
};

// Начальные данные, если в localStorage ничего нет
export const demoEvents = [
  {
    id: 1,
    title: 'Конференция «Веб-технологии 2026»',
    type: 'conference',
    date: '2026-11-20',
    capacity: 150,
    description: 'Доклады о React и Node.js',
  },
  {
    id: 2,
    title: 'Вебинар по хукам React',
    type: 'webinar',
    date: '2026-10-25',
    capacity: 80,
    description: 'useState, useEffect и свои хуки',
  },
  {
    id: 3,
    title: 'Встреча выпускников ФИТУ',
    type: 'meeting',
    date: '2026-09-12',
    capacity: 40,
    description: 'Аудитория 502',
  },
];

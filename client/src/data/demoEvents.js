// Демонстрационные мероприятия: используются, если в localStorage еще нет данных
export const EVENT_TYPES = {
  conference: 'Конференция',
  webinar: 'Вебинар',
  meeting: 'Встреча',
};

export const demoEvents = [
  {
    id: 'demo-1',
    title: 'Конференция «Веб-технологии 2026»',
    type: 'conference',
    date: '2026-11-20',
    capacity: 150,
    description: 'Доклады о React, Node.js и облачной разработке.',
  },
  {
    id: 'demo-2',
    title: 'Вебинар «Хуки React на практике»',
    type: 'webinar',
    date: '2026-10-25',
    capacity: 80,
    description: 'Разбор useState, useEffect и пользовательских хуков.',
  },
  {
    id: 'demo-3',
    title: 'Встреча выпускников ФИТУ',
    type: 'meeting',
    date: '2026-09-12',
    capacity: 40,
    description: 'Неформальная встреча в аудитории 502.',
  },
];

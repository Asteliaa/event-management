// Файл календаря iCalendar (RFC 5545): мероприятие можно добавить в Google Calendar, Outlook и т. п.
const fmt = (date) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

const eventToIcs = (event) => {
    const start = new Date(event.startsAt);
    const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const place = event.location?.online ? 'Онлайн' : [event.location?.city, event.location?.venue].filter(Boolean).join(', ');
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//EventHub//RU',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${event.id}@eventhub`,
        `DTSTAMP:${fmt(new Date())}`,
        `DTSTART:${fmt(start)}`,
        `DTEND:${fmt(end)}`,
        `SUMMARY:${escape(event.title)}`,
        `DESCRIPTION:${escape(event.description)}`,
        `LOCATION:${escape(place)}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escape(event.title)}`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
};

module.exports = { eventToIcs };

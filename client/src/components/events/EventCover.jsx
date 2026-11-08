import { PosterCover } from './EventCard.jsx';

// Крупная обложка страницы мероприятия: изображение организатора или типографическая обложка
export default function EventCover({ event }) {
  return <PosterCover event={event} className="event-cover" dateSize="lg" />;
}

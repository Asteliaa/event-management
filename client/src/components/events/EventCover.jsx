import { Mic, MonitorPlay, Users } from 'lucide-react';
import { formatShort, formatWeekday } from '../../utils/format.js';

const TYPE_ICONS = { conference: Mic, webinar: MonitorPlay, meeting: Users };

// Обложка мероприятия: картинка по ссылке или градиент в цвете категории с иконкой типа.
// Градиент не требует загрузки изображений и работает без интернета
export default function EventCover({ event, size = 'card' }) {
  const color = event.category?.color || '#6366f1';
  const Icon = TYPE_ICONS[event.type] || Users;
  const style = event.coverUrl
    ? { backgroundImage: `linear-gradient(180deg, transparent 40%, rgb(0 0 0 / .55)), url("${event.coverUrl}")` }
    : { '--cover': color };

  return (
    <div className={`cover cover--${size} ${event.coverUrl ? 'cover--image' : ''}`} style={style}>
      {!event.coverUrl && <Icon className="cover__icon" size={size === 'hero' ? 160 : 96} strokeWidth={1.2} />}
      <div className="cover__date">
        <span className="cover__day">{formatShort(event.startsAt)}</span>
        <span className="cover__weekday">{formatWeekday(event.startsAt)}</span>
      </div>
    </div>
  );
}

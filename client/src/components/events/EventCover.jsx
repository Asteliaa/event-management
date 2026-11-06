// Обложка показывается, только если организатор загрузил изображение по ссылке
export default function EventCover({ event }) {
  if (!event.coverUrl) return null;
  return <img className="cover-img" src={event.coverUrl} alt="" loading="lazy" />;
}

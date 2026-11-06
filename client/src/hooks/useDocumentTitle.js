import { useEffect } from 'react';

// Заголовок вкладки браузера для каждой страницы
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · EventHub` : 'EventHub — мероприятия с регистрацией и напоминаниями';
  }, [title]);
}

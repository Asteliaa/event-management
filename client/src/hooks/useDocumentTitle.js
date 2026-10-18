import { useEffect } from 'react';

// Побочный эффект: заголовок вкладки браузера отражает текущее состояние списка
export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

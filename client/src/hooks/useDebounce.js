import { useEffect, useState } from 'react';

// Значение обновляется только через delay мс после последнего изменения (поиск при вводе)
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

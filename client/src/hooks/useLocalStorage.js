import { useEffect, useRef, useState } from 'react';

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    // Поврежденный JSON или недоступное хранилище: начинаем с начальных данных
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Состояние, синхронизированное с localStorage.
 * loadDelay имитирует ответ сервера при монтировании,
 * saveDelay задает debounce автосохранения после последнего изменения.
 */
export function useLocalStorage(key, initialValue, { loadDelay = 0, saveDelay = 0 } = {}) {
  const [value, setValue] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const [savedAt, setSavedAt] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const latest = useRef(value);
  // Начальное значение нужно только при первом запуске, поэтому хранится в ref и не входит в зависимости
  const initialRef = useRef(initialValue);
  const skipNextSave = useRef(true);

  // Загрузка при монтировании (пустой массив зависимостей).
  useEffect(() => {
    const timer = setTimeout(() => {
      const stored = readStorage(key, null);
      if (stored === null) {
        // Хранилище пустое: инициализируем начальными данными и сразу сохраняем их
        writeStorage(key, initialRef.current);
        setValue(initialRef.current);
      } else {
        setValue(stored);
      }
      setIsLoading(false);
    }, loadDelay);
    // Очистка: если компонент размонтирован до окончания «загрузки», таймер отменяется
    return () => clearTimeout(timer);
  }, [key, loadDelay]);

  // Сохранение при каждом изменении value с задержкой saveDelay (debounce).
  useEffect(() => {
    latest.current = value;
    if (isLoading) return undefined;
    if (skipNextSave.current) {
      // Первое срабатывание после загрузки: данные только что прочитаны, писать нечего
      skipNextSave.current = false;
      return undefined;
    }
    setIsDirty(true);
    const timer = setTimeout(() => {
      if (writeStorage(key, value)) setSavedAt(new Date());
      setIsDirty(false);
    }, saveDelay);
    // Новое изменение до истечения задержки отменяет предыдущий таймер
    return () => clearTimeout(timer);
  }, [key, value, isLoading, saveDelay]);

  // Если страницу закрывают или перезагружают раньше, чем сработал таймер,
  // последнее значение записывается немедленно.
  useEffect(() => {
    if (isLoading) return undefined;
    const flush = () => writeStorage(key, latest.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [key, isLoading]);

  return { value, setValue, isLoading, isDirty, savedAt };
}

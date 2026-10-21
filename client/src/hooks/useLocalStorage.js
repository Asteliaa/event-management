import { useEffect, useState } from 'react';

// Хук для хранения списка в localStorage
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState(null);

  // Загрузка при монтировании (имитация запроса к серверу 1 секунда)
  useEffect(() => {
    const timer = setTimeout(() => {
      let data = null;
      try {
        data = JSON.parse(localStorage.getItem(key));
      } catch {
        data = null; // в хранилище испорченные данные
      }
      if (!Array.isArray(data)) {
        data = initialValue;
        localStorage.setItem(key, JSON.stringify(data));
      }
      setValue(data);
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
    // пустой массив: загрузка только один раз при монтировании
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Автосохранение через 500 мс после последнего изменения
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify(value));
      setSavedAt(new Date());
    }, 500);

    return () => clearTimeout(timer);
    // сохраняем при каждом изменении списка
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [value, setValue, loading, savedAt];
}

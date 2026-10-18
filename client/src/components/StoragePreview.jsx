// Показывает, что фактически лежит в localStorage. Строка читается из хранилища
// при каждом рендере (в том числе после автосохранения), а не берется из состояния React.
export default function StoragePreview({ storageKey }) {
  const raw = window.localStorage.getItem(storageKey) ?? 'null';
  let pretty = raw;
  try {
    const data = JSON.parse(raw);
    // Каждое мероприятие выводится одной строкой, чтобы список целиком помещался на экран
    pretty = Array.isArray(data)
      ? ['[', data.map((item) => `  ${JSON.stringify(item)}`).join(',\n'), ']'].join('\n')
      : JSON.stringify(data, null, 2);
  } catch {
    // Невалидный JSON выводится как есть
  }

  return (
    <details className="card storage">
      <summary>
        Данные в localStorage: <code>{storageKey}</code>
        <span className="storage-size">{raw.length} символов</span>
      </summary>
      <pre>{pretty}</pre>
    </details>
  );
}

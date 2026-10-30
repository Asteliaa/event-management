import { useEffect } from 'react';

// Всплывающие уведомления в правом нижнем углу, каждое исчезает через 6 секунд
function Notification({ item, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(item.id), 6000);
    return () => clearTimeout(timer);
  }, [item.id, onClose]);

  return (
    <div className={`toast ${item.kind || ''}`}>
      <span>{item.text}</span>
      <button onClick={() => onClose(item.id)}>×</button>
    </div>
  );
}

function Notifications({ items, onClose }) {
  return (
    <div className="toasts">
      {items.map((item) => (
        <Notification key={item.id} item={item} onClose={onClose} />
      ))}
    </div>
  );
}

export default Notifications;

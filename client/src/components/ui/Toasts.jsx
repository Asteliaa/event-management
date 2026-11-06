import { Link } from 'react-router';
import { BellRing, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext.jsx';

const ICONS = { success: CheckCircle2, error: TriangleAlert, warning: TriangleAlert, info: Info, reminder: BellRing };

// Всплывающие уведомления (toast) в правом нижнем углу
export default function Toasts() {
  const { toasts, dismiss } = useNotifications();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind] || Info;
        return (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <Icon size={20} className="toast__icon" />
            <div className="toast__text">
              {t.text}
              {t.link && <Link to={t.link} className="toast__link" onClick={() => dismiss(t.id)}>Открыть</Link>}
            </div>
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => dismiss(t.id)} aria-label="Закрыть"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

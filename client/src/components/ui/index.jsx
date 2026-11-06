import { useEffect } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RotateCw, X } from 'lucide-react';

// Небольшие переиспользуемые компоненты интерфейса

export function Spinner({ label = 'Загрузка…', inline = false }) {
  return (
    <div className={inline ? 'spinner spinner--inline' : 'spinner'} role="status">
      <span className="spinner__circle" aria-hidden="true" />
      <span className="spinner__label">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <AlertTriangle size={32} />
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          <RotateCw size={16} /> Повторить
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, text, children }) {
  return (
    <div className="state">
      <Icon size={36} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const numbers = Array.from({ length: pages }, (_, i) => i + 1)
    .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <nav className="pagination" aria-label="Страницы">
      <button type="button" className="pagination__btn" disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Назад">
        <ChevronLeft size={18} />
      </button>
      {numbers.map((n, i) => (
        <span key={n} className="pagination__group">
          {i > 0 && n - numbers[i - 1] > 1 && <span className="pagination__gap">…</span>}
          <button type="button" className={`pagination__btn ${n === page ? 'is-active' : ''}`} onClick={() => onChange(n)}>{n}</button>
        </span>
      ))}
      <button type="button" className="pagination__btn" disabled={page === pages} onClick={() => onChange(page + 1)} aria-label="Вперед">
        <ChevronRight size={18} />
      </button>
    </nav>
  );
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__box">
        <header className="modal__header">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, text, confirmLabel = 'Подтвердить', danger, onConfirm, onCancel, busy }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Отмена</button>
          <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Подождите…' : confirmLabel}
          </button>
        </>
      )}
    >
      <p>{text}</p>
    </Modal>
  );
}

export function Field({ label, error, hint, children }) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

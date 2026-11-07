import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { describeError } from '../utils/errors';

/*
 * Retroalimentación global (H1.2, H4.2, H5.3, H9.1):
 *  - toast.success / toast.error / toast.info / toast.warning: avisos no bloqueantes
 *    que confirman el resultado de una acción (guardar, cargar, eliminar…).
 *  - confirm({...}): diálogo de confirmación uniforme que devuelve una promesa<boolean>.
 */
const FeedbackContext = createContext(null);

const ICONS = { success: '✓', error: '!', warning: '!', info: 'i' };
const TITLES = { success: 'Acción completada', error: 'No se pudo completar', warning: 'Atención', info: 'Información' };

let toastSeq = 0;

function ToastViewport({ toasts, onClose }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon" aria-hidden="true">{ICONS[t.type]}</span>
          <div className="toast-body">
            <strong>{t.title || TITLES[t.type]}</strong>
            {t.message && <span>{t.message}</span>}
            {t.hint && <span className="toast-hint">{t.hint}</span>}
            {t.action && (
              <button type="button" className="toast-action" onClick={() => { t.action.onClick(); onClose(t.id); }}>
                {t.action.label}
              </button>
            )}
          </div>
          <button type="button" className="toast-close" onClick={() => onClose(t.id)} aria-label="Cerrar aviso">✕</button>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({ state, onAnswer }) {
  const confirmRef = useRef(null);
  useEffect(() => {
    if (!state) return undefined;
    confirmRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onAnswer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, onAnswer]);

  if (!state) return null;
  const {
    title = 'Confirmar acción',
    message,
    details,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false,
  } = state;

  return (
    <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={(e) => e.target === e.currentTarget && onAnswer(false)}>
      <div className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="modal-header">
          <h3 className="modal-title" id="confirm-title">
            <span className={`confirm-icon ${danger ? 'danger' : ''}`} aria-hidden="true">{danger ? '!' : '?'}</span>
            {title}
          </h3>
          <button className="modal-close" onClick={() => onAnswer(false)} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p id="confirm-message" style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>{message}</p>
          {details && <div className="confirm-details">{details}</div>}
          {danger && <p className="confirm-warning">Esta acción no se puede deshacer.</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onAnswer(false)}>{cancelLabel}</button>
          <button ref={confirmRef} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onAnswer(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const resolver = useRef(null);
  const timers = useRef({});

  const close = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback((type, payload) => {
    const data = typeof payload === 'string' ? { message: payload } : payload;
    const id = ++toastSeq;
    setToasts((list) => [...list.slice(-3), { id, type, ...data }]);
    const duration = data.duration ?? (type === 'error' ? 9000 : 5000);
    if (duration > 0) timers.current[id] = setTimeout(() => close(id), duration);
    return id;
  }, [close]);

  const toast = useMemo(() => ({
    success: (p) => push('success', p),
    info: (p) => push('info', p),
    warning: (p) => push('warning', p),
    error: (p) => push('error', p),
    /** Muestra un error de API con qué pasó y cómo resolverlo; `retry` añade el botón Reintentar. */
    apiError: (err, fallback, retry) => {
      const d = describeError(err, fallback);
      return push('error', {
        title: d.title,
        message: d.message,
        hint: d.hint,
        action: retry ? { label: 'Reintentar', onClick: retry } : undefined,
      });
    },
    close,
  }), [push, close]);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolver.current = resolve;
    setConfirmState(typeof options === 'string' ? { message: options } : options);
  }), []);

  const answer = useCallback((value) => {
    resolver.current?.(value);
    resolver.current = null;
    setConfirmState(null);
  }, []);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onClose={close} />
      <ConfirmDialog state={confirmState} onAnswer={answer} />
    </FeedbackContext.Provider>
  );
}

const NOOP_TOAST = {
  success: () => {}, info: () => {}, warning: () => {}, error: () => {}, apiError: () => {}, close: () => {},
};

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(FeedbackContext)?.toast || NOOP_TOAST;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(FeedbackContext);
  return ctx?.confirm || ((o) => Promise.resolve(window.confirm(typeof o === 'string' ? o : o.message)));
}

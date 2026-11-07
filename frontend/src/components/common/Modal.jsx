import { useCallback, useEffect, useId } from 'react';
import { useConfirm } from '../../context/FeedbackContext';

/*
 * Ventana modal uniforme (H4.2).
 *  - Se cierra con Esc, con la «✕» o haciendo clic fuera.
 *  - `dirty`: si el formulario tiene cambios sin guardar, pide confirmación antes de cerrarse (H3.1, H3.3).
 *  - `busy`: mientras se guarda no se puede cerrar accidentalmente.
 */
export default function Modal({ isOpen, onClose, title, children, footer, size = '', dirty = false, busy = false }) {
  const confirm = useConfirm();
  const titleId = useId();

  const requestClose = useCallback(async () => {
    if (busy) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Descartar cambios',
        message: 'Hay cambios sin guardar en este formulario. Si cierras ahora se perderán.',
        confirmLabel: 'Descartar cambios',
        cancelLabel: 'Seguir editando',
      });
      if (!ok) return;
    }
    onClose();
  }, [busy, dirty, confirm, onClose]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      // Si hay un diálogo de confirmación abierto, él gestiona Esc.
      if (e.key === 'Escape' && !document.querySelector('.confirm-dialog')) requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, requestClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && requestClose()}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h3 className="modal-title" id={titleId}>{title}</h3>
          <button className="modal-close" onClick={requestClose} aria-label="Cerrar" disabled={busy}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, danger, confirmLabel }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || 'Confirmar acción'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel || (danger ? 'Eliminar' : 'Confirmar')}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{message}</p>
      {danger && <p className="confirm-warning">Esta acción no se puede deshacer.</p>}
    </Modal>
  );
}

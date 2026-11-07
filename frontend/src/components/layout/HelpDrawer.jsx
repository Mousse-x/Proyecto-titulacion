import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { helpForPath, STATUS_HELP } from '../../help/helpContent';

/* Panel lateral de ayuda contextual de la pantalla actual (H10.1, H10.3). */
export default function HelpDrawer({ open, onClose }) {
  const { pathname } = useLocation();
  const help = helpForPath(pathname);
  const closeRef = useRef(null);
  const showStatuses = /validation|index|rankings|documents/.test(pathname);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="help-drawer" role="dialog" aria-modal="true" aria-labelledby="help-drawer-title">
        <div className="help-drawer-header">
          <div>
            <div className="help-drawer-kicker">Ayuda de esta pantalla</div>
            <h3 id="help-drawer-title">{help.title}</h3>
          </div>
          <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Cerrar ayuda">✕</button>
        </div>
        <div className="help-drawer-body">
          <p className="help-purpose">{help.purpose}</p>
          {help.steps?.length > 0 && (
            <>
              <h4>Cómo usarla</h4>
              <ol className="help-steps">
                {help.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </>
          )}
          {help.tips?.length > 0 && (
            <>
              <h4>Consejos</h4>
              <ul className="help-tips">
                {help.tips.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </>
          )}
          {showStatuses && (
            <>
              <h4>Significado de los estados</h4>
              <dl className="help-status-list">
                {STATUS_HELP.map((s) => (
                  <div key={s.label}>
                    <dt><span className={`badge badge-${s.kind}`}>{s.label}</span></dt>
                    <dd>{s.def}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
        <div className="help-drawer-footer">
          <Link to="/ayuda" className="btn btn-primary" onClick={onClose}>Abrir el Centro de ayuda</Link>
          <span className="help-shortcut-hint"><kbd>Alt</kbd> + <kbd>H</kbd> abre esta ayuda</span>
        </div>
      </aside>
    </div>
  );
}

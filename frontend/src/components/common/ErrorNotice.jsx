import { describeError } from '../../utils/errors';

/*
 * Aviso de error en línea: indica qué ocurrió, si es un error técnico o de datos,
 * y cómo continuar, con botón opcional de reintento (H9.1, H9.2, H9.3).
 * Acepta un objeto de error (axios/fetch) o un texto ya redactado.
 */
export default function ErrorNotice({ error, fallback, onRetry, onDismiss, style }) {
  if (!error) return null;
  const info = typeof error === 'string'
    ? { title: 'No se pudo completar la acción', message: error, hint: '', technical: false }
    : describeError(error, fallback);

  return (
    <div className="alert alert-danger error-notice" role="alert" style={{ marginBottom: 16, ...style }}>
      <div className="error-notice-body">
        <strong>
          {info.technical && <span className="error-kind">Error técnico</span>}
          {info.title}
        </strong>
        <span>{info.message}</span>
        {info.hint && <span className="error-notice-hint">¿Qué hacer? {info.hint}</span>}
      </div>
      {(onRetry || onDismiss) && (
        <div className="error-notice-actions">
          {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>↻ Reintentar</button>}
          {onDismiss && <button type="button" className="btn btn-secondary btn-sm" onClick={onDismiss} aria-label="Ocultar mensaje">Ocultar</button>}
        </div>
      )}
    </div>
  );
}

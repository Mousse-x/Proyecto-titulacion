import { useState } from 'react';
import { validationApi } from '../api/validation';

export default function LotaipCriteriaTable({ result, onSaved }) {
  const rubric = result.rubrica_lotaip;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!rubric) return <div className="alert alert-warning">Evaluación histórica. Revalida el documento para obtener una calificación automática definitiva.</div>;

  const hasPending = rubric.criterios.some((criterion) => criterion.aplica && criterion.calificacion == null);
  const retry = async () => {
    setBusy(true);
    setError('');
    try {
      await validationApi.validateDocument(result.evidence_id);
      await onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar la evaluación automática.');
    } finally {
      setBusy(false);
    }
  };

  return <section aria-label="Criterios de evaluación LOTAIP">
    <p><strong>Evaluación LOTAIP automática</strong> · <a href={rubric.fuente} target="_blank" rel="noreferrer">Consultar instructivo de referencia</a></p>
    <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Versión del motor: {result.engine_version || rubric.engine_version || rubric.version}</p>
    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
      La nota se calcula sobre el paquete de metadatos, diccionario y conjunto de datos. Los enlaces se comprueban en una
      muestra reproducible de 3 filas y todos deben cumplir (Tabla 6). Lo que no pudo comprobarse queda pendiente de
      reintento; los enlaces con NO APLICA se marcan SIN EVALUACIÓN y no entran en el promedio.
    </p>
    {error && <div role="alert" className="alert alert-danger">{error}</div>}
    <div className="table-wrapper">
      <table className="table" style={{ minWidth: 720 }}>
        <thead><tr><th>Criterio de evaluación</th><th>Calificación</th><th>Observación / evidencia automática</th></tr></thead>
        <tbody>{rubric.criterios.map((criterion) => <tr key={criterion.id}>
          <td style={{ width: '32%', whiteSpace: 'normal' }}>
            <strong>{criterion.criterio}</strong>
            <div style={{ fontSize: '0.75rem', marginTop: 6 }}>{criterion.regla}</div>
            <small style={{ color: 'var(--text-subtle)' }}>{criterion.referencia}</small>
          </td>
          <td style={{ width: '18%', whiteSpace: 'normal' }}>
            {!criterion.aplica ? 'No aplica' : <strong>{criterion.calificacion ?? 'Pendiente de verificación'}</strong>}
          </td>
          <td style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
            {criterion.observacion}
            {criterion.evidencias?.length > 0 && <details>
              <summary>Ver comprobaciones ({criterion.evidencias.length})</summary>
              <ul>{criterion.evidencias.map((item, index) => <li key={index}>
                <strong>{item.status}</strong> · {item.document}, fila {item.row ?? 'ausente'}: {item.field}. {item.reason}
              </li>)}</ul>
            </details>}
          </td>
        </tr>)}</tbody>
      </table>
    </div>
    <p style={{ fontSize: '0.8125rem' }}>SITA = (CTA + ETA + RP + CI) / 4. NO APLICA justificado cuenta como cumplimiento. No se emplean decisiones manuales.</p>
    {hasPending && <button className="btn btn-primary" disabled={busy} onClick={retry}>{busy ? 'Evaluando…' : 'Actualizar a evaluación automática definitiva'}</button>}
    {rubric.verificado_en && <p>Comprobación automática: {new Date(rubric.verificado_en).toLocaleString('es-EC')}</p>}
  </section>;
}

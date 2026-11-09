import { useEffect, useMemo, useState } from 'react';
import DonutChart from '../../components/charts/DonutChart';
import { api } from '../../api/client';
import ErrorNotice from '../../components/common/ErrorNotice';
import { useConfirm, useToast } from '../../context/FeedbackContext';

const palette = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];
const filters = [['ALL', 'Todos'], ['NACIONAL', 'Nacionales'], ['MIXTO', 'Mixtos'], ['INTERNACIONAL', 'Internacionales']];
const classificationStyle = {
  NACIONAL: { color: 'var(--primary)', background: 'var(--primary-subtle)' },
  MIXTO: { color: 'var(--warning)', background: 'var(--warning-subtle)' },
  INTERNACIONAL: { color: 'var(--success)', background: 'var(--success-subtle)' },
};
const rounded = (value) => Number(Number(value || 0).toFixed(2));
/* "faltan 5 %" / "sobran 5 %" respecto al 100 % exigido. */
const gapText = (total) => {
  const diff = rounded(100 - total);
  return diff > 0 ? `faltan ${diff} %` : `sobran ${Math.abs(diff)} %`;
};
const isFull = (total) => Math.abs(total - 100) <= 0.01;

/* Fracción visual: numerador sobre denominador. */
function Frac({ top, bottom }) {
  return (
    <span className="fx-frac">
      <span className="fx-frac-top">{top}</span>
      <span className="fx-frac-bottom">{bottom}</span>
    </span>
  );
}

/* Explicación de la fórmula del índice en dos pasos, con significado de cada símbolo y un ejemplo. */
function FormulaExplainer() {
  return (
    <div className="fx">
      <ol className="fx-steps">
        <li className="fx-step">
          <div className="fx-step-head"><span className="fx-step-num">1</span>Nota de cada dimensión</div>
          <div className="fx-eq">
            <span className="fx-var">D<sub>d</sub></span> = 100 ×
            <Frac top={<>Σ ( w<sub>i</sub> × s<sub>i</sub> )</>} bottom={<>Σ w<sub>i</sub></>} />
          </div>
          <p className="fx-say">
            Es el <strong>promedio ponderado</strong> de los indicadores de la dimensión, expresado de 0 a 100.
            Los indicadores con más peso influyen más en la nota.
          </p>
        </li>
        <li className="fx-step">
          <div className="fx-step-head"><span className="fx-step-num">2</span>Índice de Transparencia (ITI)</div>
          <div className="fx-eq">
            <span className="fx-var">ITI</span> = Σ ( W<sub>d</sub> × D<sub>d</sub> )
          </div>
          <p className="fx-say">
            Se multiplica la nota de cada una de las <strong>8 dimensiones</strong> por su peso y se suman.
            Como los pesos suman 100 %, el resultado también va de 0 a 100.
          </p>
        </li>
      </ol>

      <dl className="fx-legend">
        <div><dt>s<sub>i</sub></dt><dd>Resultado del indicador: 1 cumple, 0 no cumple, valores intermedios si cumple en parte.</dd></div>
        <div><dt>w<sub>i</sub></dt><dd>Peso del indicador dentro de su dimensión (se edita abajo).</dd></div>
        <div><dt>D<sub>d</sub></dt><dd>Nota de la dimensión, de 0 a 100.</dd></div>
        <div><dt>W<sub>d</sub></dt><dd>Peso de la dimensión en el índice (25 % = 0,25).</dd></div>
      </dl>

      <div className="fx-example">
        <span className="fx-example-label">Ejemplo</span>
        Una dimensión con 3 indicadores de peso 50, 30 y 20 que obtienen 1, 0,5 y 0:
        {' '}<strong>D = 100 × (50×1 + 30×0,5 + 20×0) / 100 = 65</strong>.
        Si esa dimensión pesa 20 %, aporta 0,20 × 65 = <strong>13 puntos</strong> al ITI.
      </div>

      <ul className="fx-rules">
        <li><strong>“No aplica”</strong> no cuenta: se quita de la suma de arriba y de la de abajo, así no baja la nota.</li>
        <li><strong>Pendientes o con error técnico</strong> no se cuentan como cero: el índice queda como provisional hasta evaluarlos.</li>
      </ul>
    </div>
  );
}

export default function IntegratedWeightingsPage() {
  const [saved, setSaved] = useState({ dimensions: [], formula: '' });
  const [draft, setDraft] = useState({ dimensions: [], formula: '' });
  const [filter, setFilter] = useState('ALL');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const toast = useToast();
  const confirmAction = useConfirm();

  const loadModel = () => {
    setLoading(true);
    api.transparencyModel.get()
      .then(({ data }) => {
        const model = data || { dimensions: [], formula: '' };
        setSaved(model);
        setDraft(model);
        setExpanded(Object.fromEntries((model.dimensions || []).map((dimension) => [dimension.id, false])));
      })
      .catch((error) => setNotice({ error: true, raw: error, text: 'No se pudo cargar el modelo de ponderaciones.' }))
      .finally(() => setLoading(false));
  };

  useEffect(loadModel, []);

  const dimensionTotal = useMemo(
    () => rounded(draft.dimensions.reduce((sum, dimension) => sum + Number(dimension.weight || 0), 0)),
    [draft.dimensions],
  );
  const counts = useMemo(() => {
    const all = draft.dimensions.flatMap((dimension) => dimension.indicators || []);
    return Object.fromEntries(['ALL', 'NACIONAL', 'MIXTO', 'INTERNACIONAL'].map((key) => [
      key, key === 'ALL' ? all.length : all.filter((indicator) => indicator.classification === key).length,
    ]));
  }, [draft.dimensions]);
  const validationErrors = useMemo(() => {
    const errors = [];
    const outOfRange = (v) => v === '' || Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100;
    draft.dimensions.forEach((dimension) => {
      if (outOfRange(dimension.weight)) errors.push(`${dimension.code}: el peso debe ser un número entre 0 y 100.`);
      (dimension.indicators || []).forEach((indicator) => {
        if (outOfRange(indicator.weight)) errors.push(`${dimension.code} · ${indicator.code || indicator.name}: el peso debe ser un número entre 0 y 100.`);
      });
    });
    if (!isFull(dimensionTotal)) errors.push(`Las 8 dimensiones suman ${dimensionTotal} % (${gapText(dimensionTotal)} para llegar a 100 %).`);
    draft.dimensions.forEach((dimension) => {
      const total = rounded(dimension.indicators.reduce((sum, indicator) => sum + Number(indicator.weight || 0), 0));
      if (!isFull(total)) errors.push(`${dimension.code} · ${dimension.name}: sus indicadores suman ${total} % (${gapText(total)}).`);
    });
    return errors;
  }, [dimensionTotal, draft.dimensions]);
  const dirty = JSON.stringify(draft.dimensions) !== JSON.stringify(saved.dimensions);

  const discard = async () => {
    if (dirty) {
      const ok = await confirmAction({
        title: '¿Descartar los cambios?',
        message: 'Se restaurarán las ponderaciones guardadas y se perderán los pesos editados.',
        confirmLabel: 'Descartar cambios',
        danger: true,
      });
      if (!ok) return;
    }
    setDraft(saved);
    setNotice(null);
    toast.info({ title: 'Cambios descartados', message: 'Se restauraron las ponderaciones guardadas.' });
  };

  const updateDimension = (id, weight) => setDraft((current) => ({
    ...current,
    dimensions: current.dimensions.map((dimension) => dimension.id === id ? { ...dimension, weight } : dimension),
  }));
  const updateIndicator = (dimensionId, indicatorId, weight) => setDraft((current) => ({
    ...current,
    dimensions: current.dimensions.map((dimension) => dimension.id !== dimensionId ? dimension : {
      ...dimension,
      indicators: dimension.indicators.map((indicator) => indicator.id === indicatorId ? { ...indicator, weight } : indicator),
    }),
  }));

  const save = async () => {
    if (validationErrors.length) return setNotice({ error: true, text: validationErrors[0] });
    const ok = await confirmAction({
      title: '¿Guardar las nuevas ponderaciones?',
      message: 'Se sobrescribirán los pesos actuales y se recalcularán los índices ITI ya existentes de todas las universidades.',
      confirmLabel: 'Guardar y recalcular',
    });
    if (!ok) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        dimensions: draft.dimensions.map(({ id, weight }) => ({ id, weight: Number(weight) })),
        indicators: draft.dimensions.flatMap((dimension) => dimension.indicators.map(({ id, weight }) => ({ id, weight: Number(weight) }))),
      };
      const { data } = await api.transparencyModel.updateWeights(payload);
      setSaved(data);
      setDraft(data);
      setNotice({ error: false, text: 'Ponderaciones guardadas. Los índices existentes fueron recalculados.' });
      toast.success({ title: 'Ponderaciones guardadas', message: 'Los índices existentes fueron recalculados.' });
    } catch (error) {
      setNotice({ error: true, raw: error, text: 'No se pudieron guardar las ponderaciones.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Ponderaciones del Índice de Transparencia</h1>
          <p>Edita los pesos y consulta la familia y clasificación de los 58 indicadores.</p>
        </div>
        <div className="page-header-actions">
          {dirty && <span className="tag tag-warning" role="status">Cambios sin guardar</span>}
          <button className="btn btn-secondary" onClick={discard} disabled={loading || saving || !dirty} title={dirty ? 'Restaurar los pesos guardados' : 'No hay cambios que descartar'}>↶ Descartar cambios</button>
          <button className="btn btn-primary" onClick={save} disabled={loading || saving || validationErrors.length > 0 || !dirty}
            title={validationErrors.length ? validationErrors[0] : !dirty ? 'No hay cambios que guardar' : 'Guardar y recalcular índices'}>{saving ? 'Guardando…' : 'Guardar ponderaciones'}</button>
        </div>
      </div>

      {notice?.error && <ErrorNotice error={notice.raw || notice.text} fallback={notice.text} onRetry={notice.raw ? (saved.dimensions.length ? save : loadModel) : undefined} onDismiss={() => setNotice(null)} />}
      {!loading && validationErrors.length > 0 && (
        <div className="weights-alert" role="alert">
          <div className="weights-alert-icon" aria-hidden="true">!</div>
          <div>
            <div className="weights-alert-title">No se puede guardar: los pesos no suman 100 %</div>
            <ul>{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul>
            <div className="weights-alert-hint">Ajusta los valores marcados en rojo; el botón «Guardar ponderaciones» se activa cuando todo suma 100 %.</div>
          </div>
        </div>
      )}
      {notice && !notice.error && <div className="alert alert-success" role="status" style={{ marginBottom: 18, padding: '12px 16px', borderRadius: 'var(--radius)' }}>{notice.text}</div>}
      {loading ? <div className="card"><div className="empty-state" aria-busy="true"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} /><h4>Cargando modelo integrado…</h4></div></div> : !draft.dimensions.length ? (
        <div className="card"><div className="empty-state"><h4>Catálogo no disponible</h4><p>Aplica las migraciones del backend y vuelve a cargar la página.</p></div></div>
      ) : <>
        <div className="grid-21" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Fórmula aplicada</span><span className={`badge ${validationErrors.length ? 'badge-danger' : 'badge-success'}`}>{validationErrors.length ? 'Pesos por corregir' : 'Distribución válida'}</span></div>
            <FormulaExplainer />
          </div>
          <div className="chart-card">
            <div className="chart-title">
              Peso por dimensión · total{' '}
              <span style={{ color: isFull(dimensionTotal) ? 'var(--success)' : 'var(--danger)', fontWeight: 800 }}>
                {dimensionTotal} %{!isFull(dimensionTotal) && ` (${gapText(dimensionTotal)})`}
              </span>
            </div>
            <DonutChart data={draft.dimensions.map((dimension, index) => ({ name: dimension.code, weight: Number(dimension.weight), color: palette[index % palette.length] }))} />
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: 16 }}>
          {filters.map(([key, label]) => <button key={key} className={`tab ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>{label} ({counts[key]})</button>)}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {draft.dimensions.map((dimension, index) => {
            const visible = dimension.indicators.filter((indicator) => filter === 'ALL' || indicator.classification === filter);
            if (!visible.length) return null;
            const indicatorTotal = rounded(dimension.indicators.reduce((sum, indicator) => sum + Number(indicator.weight || 0), 0));
            const open = expanded[dimension.id] ?? false;
            return <div className="card" key={dimension.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) 160px 130px', gap: 14, alignItems: 'center', borderBottom: open ? '1px solid var(--border)' : 'none' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setExpanded((current) => ({ ...current, [dimension.id]: !open }))}>{open ? '▾' : '▸'}</button>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span style={{ width: 12, height: 12, borderRadius: 3, background: palette[index % palette.length] }} /><strong>{dimension.code} · {dimension.name}</strong><span className="tag">{dimension.indicators.length} indicadores</span></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: 5 }}>{dimension.description}</div>
                </div>
                <div style={{ fontSize: '0.75rem', color: isFull(indicatorTotal) ? 'var(--success)' : 'var(--danger)', textAlign: 'right', fontWeight: 700 }}>
                  Indicadores: {indicatorTotal} %
                  {!isFull(indicatorTotal) && <div style={{ fontWeight: 600 }}>{gapText(indicatorTotal)}</div>}
                </div>
                <label style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}><input className="form-input" type="number" min="0" max="100" step="0.01" value={dimension.weight} onChange={(event) => updateDimension(dimension.id, event.target.value)} style={{ textAlign: 'right', ...(isFull(dimensionTotal) ? {} : { borderColor: 'var(--danger)' }) }} aria-label={`Peso de la dimensión ${dimension.code} (0 a 100 %)`} /><span>%</span></label>
              </div>
              {open && <div className="table-wrapper" style={{ border: 0, borderRadius: 0 }}><table className="table">
                <thead><tr><th>Código</th><th>Clasificación</th><th>Familia</th><th>Indicador y trazabilidad</th><th style={{ width: 130 }}>Peso interno</th></tr></thead>
                <tbody>{visible.map((indicator) => <tr key={indicator.id}>
                  <td><strong style={{ color: 'var(--primary-light)' }}>{indicator.code}</strong></td>
                  <td><span className="badge" style={classificationStyle[indicator.classification]}>{indicator.classification_label}</span>{indicator.classification === 'MIXTO' && <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', marginTop: 5 }}>Solo se busca el complemento internacional.</div>}</td>
                  <td>{indicator.family_code ? <><strong>{indicator.family_code}</strong><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>{indicator.family_name}</div>{!!indicator.source_frameworks?.length && <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', marginTop: 4 }}>{indicator.source_frameworks.join(' · ')}</div>}</> : <span style={{ color: 'var(--text-subtle)' }}>Base nacional LOTAIP</span>}</td>
                  <td style={{ minWidth: 320 }}><div style={{ fontSize: '0.8125rem', lineHeight: 1.45 }}>{indicator.statement}</div>{indicator.traceability && <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: 5 }}>Trazabilidad: {indicator.traceability}</div>}{!!indicator.lotaip_numerals?.length && <div style={{ fontSize: '0.72rem', color: 'var(--primary-light)', marginTop: 4 }}>LOTAIP: numeral{indicator.lotaip_numerals.length > 1 ? 'es' : ''} {indicator.lotaip_numerals.join(', ')}</div>}</td>
                  <td><label style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}><input className="form-input" type="number" min="0" max="100" step="0.01" value={indicator.weight} onChange={(event) => updateIndicator(dimension.id, indicator.id, event.target.value)} style={{ textAlign: 'right', ...(isFull(indicatorTotal) ? {} : { borderColor: 'var(--danger)' }) }} aria-label={`Peso del indicador ${indicator.code || indicator.name} (0 a 100 %)`} /><span>%</span></label></td>
                </tr>)}</tbody>
              </table></div>}
            </div>;
          })}
        </div>
      </>}
    </div>
  );
}

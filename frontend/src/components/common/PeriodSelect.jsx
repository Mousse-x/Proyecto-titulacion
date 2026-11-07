export default function PeriodSelect({ stats, value, onChange }) {
  const periods = stats.available_periods || [];
  if (!periods.length) return null;
  return (
    <div className="filter-field">
    <label htmlFor="period-select">Período evaluado</label>
    <select id="period-select" className="form-input" style={{ width: 'auto' }} value={value} onChange={(e) => onChange(e.target.value)}>
      {periods.map((period) => (
        <option key={period.id} value={String(period.id)}>
          {period.name} · {period.universities} universidad{period.universities === 1 ? '' : 'es'}
        </option>
      ))}
    </select>
    </div>
  );
}

export function SimulatedNotice({ stats }) {
  if (!stats.simulated) return null;
  return (
    <div className="alert alert-warning" style={{ marginBottom: 20 }}>
      En este período, la correspondencia de los verificables LOTAIP es simulada (comando
      <code style={{ margin: '0 4px' }}>datos_demo</code>); los documentos LOTAIP son reales y los indicadores
      internacionales provienen de una referencia documental con evidencia citada y de mediciones técnicas.
    </div>
  );
}

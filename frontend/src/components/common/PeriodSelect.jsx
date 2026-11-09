export default function PeriodSelect({ stats, value, onChange }) {
  const periods = stats.available_periods || [];
  if (!periods.length) return null;
  return (
    <div className="filter-field period-picker">
      <label htmlFor="period-select">Período evaluado</label>
      <div className="period-picker-box">
        <svg className="period-picker-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
          <path d="M3 9.5h18M8 2.8v3.4M16 2.8v3.4" />
        </svg>
        <select id="period-select" value={value} onChange={(e) => onChange(e.target.value)}
          title={periods.length > 1 ? `Hay ${periods.length} períodos disponibles` : undefined}>
          {periods.map((period) => (
            <option key={period.id} value={String(period.id)}>
              {period.name} · {period.universities} universidad{period.universities === 1 ? '' : 'es'}
            </option>
          ))}
        </select>
        <svg className="period-picker-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
          strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </div>
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

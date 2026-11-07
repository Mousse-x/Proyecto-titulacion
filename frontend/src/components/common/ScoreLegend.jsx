/* Leyenda de la escala de clasificación del índice (H2.3). */
const LEVELS = [
  { label: 'Alto', range: '≥ 90 %', color: 'var(--success)' },
  { label: 'Medio', range: '70–89 %', color: 'var(--warning)' },
  { label: 'Bajo', range: '40–69 %', color: 'var(--info)' },
  { label: 'Crítico', range: '< 40 %', color: 'var(--danger)' },
];

export default function ScoreLegend() {
  return (
    <div className="score-legend" aria-label="Escala de clasificación">
      <strong style={{ color: 'var(--text-muted)' }}>Escala:</strong>
      {LEVELS.map((l) => (
        <span key={l.label}><i style={{ background: l.color }} aria-hidden="true" />{l.label} {l.range}</span>
      ))}
    </div>
  );
}

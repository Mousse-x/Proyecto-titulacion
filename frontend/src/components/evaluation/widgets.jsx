import { formatLotaipPercent } from '../../utils/lotaipDashboard';
import { scoreColor, scoreInk } from './evaluationUi';

/* Anillo de puntuación con la cifra centrada. */
export function ScoreRing({ value, size = 112, stroke = 9 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, Number(value)));
  const color = scoreColor(value);
  return (
    <div className="eval-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <span className="eval-ring-value" style={{ color: scoreInk(value) }}>{value == null ? '—' : formatLotaipPercent(value)}</span>
    </div>
  );
}

/* Barra horizontal etiquetada (0–100). */
export function MeterRow({ label, value, hint }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, Number(value)));
  return (
    <div className="eval-meter" title={hint ? `${label}: ${hint}` : undefined} aria-label={`${label}${hint ? ` (${hint})` : ''}: ${value == null ? 'sin dato' : `${Number(value).toFixed(1)} %`}`}>
      <span className="eval-meter-label">{hint ? <abbr title={hint}>{label}</abbr> : label}</span>
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%`, background: scoreColor(value) }} /></div>
      <strong style={{ color: scoreInk(value) }}>{value == null ? '—' : `${Number(value).toFixed(1)}%`}</strong>
    </div>
  );
}

/* Grupo de botones-filtro con contador. */
export function FilterChips({ options, value, onChange }) {
  return (
    <div className="eval-chips" role="group">
      {options.map((option) => (
        <button key={option.value} type="button" className={`eval-chip${value === option.value ? ' active' : ''}`}
          onClick={() => onChange(option.value)} aria-pressed={value === option.value}>
          {option.color && <span className="eval-chip-dot" style={{ background: option.color }} />}
          {option.label}
          <span className="eval-chip-count">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

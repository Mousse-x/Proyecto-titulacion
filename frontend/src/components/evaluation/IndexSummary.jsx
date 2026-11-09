import { useEffect, useState } from 'react';
import { scoreColor, scoreInk } from './evaluationUi';

const DURATION_MS = 1400;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/* Cuenta de 0 al valor final (el padre remonta con `key` si cambia); respeta "reducir movimiento". */
function useCountUp(target, delay = 0) {
  const [progress, setProgress] = useState(0);
  const reduce = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (target == null || reduce) return undefined;
    let frame;
    let start;
    const tick = (now) => {
      if (start == null) start = now;
      const t = Math.min(1, (now - start) / DURATION_MS);
      setProgress(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => { frame = requestAnimationFrame(tick); }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [target, delay, reduce]);

  if (target == null) return 0;
  return reduce ? target : target * easeOutCubic(progress);
}

function formatPercent(value) {
  return `${value.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function AnimatedIndex({ title, value, delay, active, onSelect, hint }) {
  const target = value == null ? null : Math.max(0, Math.min(100, Number(value)));
  const current = useCountUp(target, delay);
  const size = 168;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = target == null ? 'var(--text-subtle)' : scoreColor(target);

  return (
    <button type="button" className={`card eval-index-card${active ? ' active' : ''}`}
      style={{ animationDelay: `${delay}ms` }} onClick={onSelect} aria-pressed={active} title={hint}
      aria-label={`${title}: ${target == null ? 'sin evaluar' : formatPercent(target)}. ${hint}`}>
      <div className="eval-index-title">{title}</div>
      <div className="eval-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={c} strokeDashoffset={c - (current / 100) * c} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </svg>
        <span className="eval-ring-value" style={{ color: target == null ? color : scoreInk(target) }} aria-hidden="true">
          {target == null ? '—' : formatPercent(current)}
        </span>
      </div>
      <span className="eval-index-go" aria-hidden="true">Ver detalle →</span>
    </button>
  );
}

/* Las tres calificaciones de la página; al pulsar una se abre su pestaña. */
export default function IndexSummary({ lotaip, international, integrated, activeTab, onSelect }) {
  return (
    <div className="eval-summary">
      <AnimatedIndex key={`nacional-${lotaip?.sita}`} title="Índice nacional" value={lotaip?.sita ?? null} delay={0}
        active={activeTab === 'lotaip'} onSelect={() => onSelect?.('lotaip')} hint="Ver la evaluación nacional LOTAIP" />
      <AnimatedIndex key={`internacional-${international?.score}`} title="Índice internacional" value={international?.score ?? null} delay={150}
        active={activeTab === 'international'} onSelect={() => onSelect?.('international')} hint="Ver la evaluación internacional" />
      <AnimatedIndex key={`combinado-${integrated?.index_percent}`} title="Combinado · ITI" value={integrated?.index_percent ?? null} delay={300}
        active={activeTab === 'combined'} onSelect={() => onSelect?.('combined')} hint="Ver el cumplimiento por dimensión (ITI)" />
    </div>
  );
}

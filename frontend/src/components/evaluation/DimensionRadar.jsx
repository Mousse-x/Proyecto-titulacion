import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip,
} from 'recharts';
import { scoreInk } from './evaluationUi';

const COLOR = 'var(--primary)';
function RadarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="eval-radar-tooltip">
      <div className="eval-radar-tooltip-name">{d.code} · {d.name}</div>
      <div className="eval-radar-tooltip-score" style={{ color: d.rawScore == null ? 'var(--warning)' : scoreInk(d.rawScore) }}>
        {d.rawScore == null ? 'Pendiente' : `${Number(d.rawScore).toFixed(1)} %`}
      </div>
      <div className="eval-radar-tooltip-meta">{d.met}/{d.total} indicadores cumplen</div>
    </div>
  );
}

/* Radar de las dimensiones D1–D8; al pulsar un vértice, etiqueta o fila se filtra esa dimensión. */
export default function DimensionRadar({ dimensions, indicators, selected, onSelect }) {
  // Datos estables: el crecimiento del polígono es solo CSS (ver .eval-radar-area), así ejes y etiquetas no se redibujan.
  const data = useMemo(() => (dimensions || []).map((d) => {
    const items = indicators.filter((i) => i.dimension === d.code);
    return {
      code: d.code,
      name: d.name,
      rawScore: d.score,
      score: d.score == null ? 0 : Math.max(0, Math.min(100, Number(d.score))),
      met: items.filter((i) => i.status === 'CUMPLE').length,
      total: items.length,
    };
  }), [dimensions, indicators]);
  // Recharts recrea polígono y puntos al seleccionar o al mover el tooltip, así que
  // las animaciones CSS solo se activan por ventanas de tiempo: la entrada al montar
  // (`intro`) y el "salto" del punto justo después de elegirlo (`popCode`).
  const [intro, setIntro] = useState(true);
  const [popCode, setPopCode] = useState(null);
  const popTimer = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => setIntro(false), 1150);
    return () => { clearTimeout(timer); clearTimeout(popTimer.current); };
  }, []);
  // Siempre hay una dimensión elegida: pulsar otra la cambia; pulsar la misma no hace nada.
  const toggle = (code) => {
    if (code === selected) return;
    const next = code;
    onSelect(next);
    clearTimeout(popTimer.current);
    setPopCode(next);
    popTimer.current = setTimeout(() => setPopCode(null), 550);
  };

  // Solo el código (D1…D8): la lista lateral ya dice qué es cada dimensión.
  const renderTick = ({ x, y, cy, payload, textAnchor }) => {
    const d = data.find((item) => item.code === payload.value);
    if (!d) return null;
    const isActive = selected === d.code;
    const rel = cy == null ? 0 : y - cy;
    const dy = rel < -20 ? -4 : rel > 20 ? 12 : 4;
    return (
      <g className="eval-radar-tick" onClick={() => toggle(d.code)} style={{ cursor: 'pointer' }}>
        <title>{`${d.code} · ${d.name}`}</title>
        <text x={x} y={y + dy} textAnchor={textAnchor} fontSize={13} fontWeight={800}
          fill={isActive ? 'var(--primary)' : 'var(--text)'}>{d.code}</text>
      </g>
    );
  };

  const renderDot = ({ cx, cy, payload }) => {
    const isActive = selected === payload.code;
    if (!isActive) {
      return (
        <circle key={`dot-${payload.code}`} cx={cx} cy={cy} r={5} fill={COLOR}
          style={{ cursor: 'pointer' }} onClick={() => toggle(payload.code)} />
      );
    }
    // Punto seleccionado: halo y punto que "salta", solo justo después de elegirlo.
    return (
      <g key={`dot-${payload.code}`} className={popCode === payload.code ? 'eval-radar-pop' : undefined}
        style={{ cursor: 'pointer' }} onClick={() => toggle(payload.code)}>
        <circle className="eval-radar-halo" cx={cx} cy={cy} r={14} fill={COLOR} />
        <circle className="eval-radar-dot-active" cx={cx} cy={cy} r={7} fill="var(--bg-card)" stroke={COLOR} strokeWidth={3} />
      </g>
    );
  };

  return (
    <div className="eval-radar-layout">
      <div className={`eval-radar-chart${intro ? ' intro' : ''}`} role="img"
        aria-label={`Radar de dimensiones: ${data.map((d) => `${d.code} ${d.rawScore == null ? 'pendiente' : `${Number(d.rawScore).toFixed(1)}%`}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={data} outerRadius="78%" margin={{ top: 20, right: 28, bottom: 20, left: 28 }}>
            <PolarGrid gridType="polygon" className="eval-radar-grid" />
            <PolarAngleAxis dataKey="code" tick={renderTick} />
            <PolarRadiusAxis angle={67.5} domain={[0, 100]} tickCount={5} axisLine={false}
              tick={{ fill: 'var(--text-subtle)', fontSize: 10 }} />
            <Tooltip content={<RadarTooltip />} />
            <Radar className="eval-radar-area" dataKey="score" stroke={COLOR} strokeWidth={2.5} fill={COLOR} fillOpacity={0.22}
              dot={renderDot} activeDot={false} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <ul className="eval-radar-legend">
        {data.map((d) => (
          <li key={d.code}>
            <button type="button" className={`eval-radar-row${selected === d.code ? ' active' : ''}`}
              onClick={() => toggle(d.code)} aria-pressed={selected === d.code}>
              <span className="eval-code">{d.code}</span>
              <span className="eval-radar-row-name" title={d.name}>{d.name}</span>
              <span className="eval-radar-row-score" style={{ color: d.rawScore == null ? 'var(--warning)' : scoreInk(d.rawScore) }}>
                {d.rawScore == null ? 'Pend.' : `${Number(d.rawScore).toFixed(1)}%`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

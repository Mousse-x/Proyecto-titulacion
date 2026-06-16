import { getScoreColor } from '../../utils/score';

export default function StatCard({ icon, label, value, change, changeDir, color, iconBg, suffix = '' }) {
  return (
    <div className="stat-card" style={{ '--color': color || 'var(--primary)' }}>
      <div className="stat-icon-wrap" style={{ background: iconBg || 'var(--primary-subtle)' }}>
        {icon}
      </div>
      <div className="stat-value">{value}{suffix}</div>
      <div className="stat-label">{label}</div>
      {change !== undefined && (
        <div className={`stat-change ${changeDir || 'up'}`}>
          {changeDir === 'down' ? '↓' : '↑'} {change}
        </div>
      )}
    </div>
  );
}

export function ScoreCard({ score, label, size = 80 }) {
  const numericScore = Number(score) || 0;
  const displayScore = size < 56
    ? numericScore.toFixed(1).replace(/\.0$/, '')
    : numericScore.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const color = getScoreColor(numericScore);
  const strokeWidth = size < 56 ? 5 : 6;
  const radius = (size - strokeWidth - 3) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (Math.min(Math.max(numericScore, 0), 100) / 100) * circ;
  const fontSize = size < 56 ? 9 : size > 70 ? 14 : 11;

  return (
    <div className="score-wrapper">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={radius - 5} fill="rgba(255,255,255,0.92)" />
        <circle
          cx={size/2} cy={size/2} r={radius}
          fill="none" stroke="var(--border)" strokeWidth={strokeWidth}
        />
        <circle
          cx={size/2} cy={size/2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
            transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
        <text
          x="50%" y="50%"
          dominantBaseline="central" textAnchor="middle"
          fill={color}
          fontSize={fontSize}
          fontWeight="900"
        >
          {displayScore}
        </text>
      </svg>
      {label && <div className="score-label">{label}</div>}
    </div>
  );
}

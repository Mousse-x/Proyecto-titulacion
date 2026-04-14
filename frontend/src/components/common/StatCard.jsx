import { getScoreColor } from '../../data/mockData';

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
  const color = getScoreColor(score);
  const radius = (size - 8) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;

  return (
    <div className="score-wrapper">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border)" strokeWidth={6} />
        <circle
          cx={size/2} cy={size/2} r={radius}
          fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
        <text
          x="50%" y="50%"
          dominantBaseline="central" textAnchor="middle"
          fill={color}
          fontSize={size > 70 ? 14 : 11}
          fontWeight="800"
          style={{ transform: 'rotate(90deg)', transformOrigin: '50% 50%' }}
        >
          {score}
        </text>
      </svg>
      {label && <div className="score-label">{label}</div>}
    </div>
  );
}

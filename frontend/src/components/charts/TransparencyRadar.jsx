import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip
} from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:'0.8125rem' }}>
        <div style={{ color:'var(--text)', fontWeight:600 }}>{payload[0].payload.subject}</div>
        <div style={{ color:'var(--primary-light)' }}>{payload[0].value} / 100</div>
      </div>
    );
  }
  return null;
};

export default function TransparencyRadar({ data, color = '#6366F1', height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 500 }}
        />
        <PolarRadiusAxis
          angle={90} domain={[0, 100]}
          tick={{ fill: 'var(--text-subtle)', fontSize: 10 }}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Radar
          name="Score"
          dataKey="score"
          stroke={color}
          fill={color}
          fillOpacity={0.2}
          strokeWidth={2}
          dot={{ fill: color, strokeWidth: 0, r: 4 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

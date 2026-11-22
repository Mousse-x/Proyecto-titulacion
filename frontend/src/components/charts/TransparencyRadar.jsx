import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip
} from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:'0.8125rem' }}>
        <div style={{ color:'var(--text)', fontWeight:600 }}>{payload[0].payload.subject}</div>
        <div style={{ color: payload[0].color, fontWeight:700 }}>{payload[0].value} / 100</div>
      </div>
    );
  }
  return null;
};

export default function TransparencyRadar({ data, color = '#6366F1', height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="78%" margin={{ top: 10, right: 24, bottom: 10, left: 24 }}>
        <PolarGrid stroke="var(--text-subtle)" strokeOpacity={0.35} />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: 'var(--text)', fontSize: 12, fontWeight: 700 }}
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
          fillOpacity={0.35}
          strokeWidth={3}
          dot={{ fill: color, stroke: '#fff', strokeWidth: 2, r: 5 }}
          activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

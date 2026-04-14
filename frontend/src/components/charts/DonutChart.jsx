import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px' }}>
        <div style={{ color:'var(--text)', fontWeight:600 }}>{payload[0].name}</div>
        <div style={{ color:payload[0].payload.color, fontSize:'0.875rem' }}>{payload[0].value}%</div>
      </div>
    );
  }
  return null;
};

export default function DonutChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={3}
          dataKey="weight"
          nameKey="name"
        >
          {data.map((entry, i) => (
            <Cell key={`cell-${i}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize:'0.75rem', paddingTop:8 }}
          formatter={(v, e) => <span style={{ color:'var(--text-muted)' }}>{v} ({e.payload.weight}%)</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

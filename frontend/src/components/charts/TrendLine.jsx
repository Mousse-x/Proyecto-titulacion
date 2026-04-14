import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';

const COLORS = {
  ESPOCH: '#6366F1', PUCE: '#8B5CF6', UCE: '#10B981',
  UTPL: '#F59E0B', UG: '#EF4444',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ color:'var(--text)', fontWeight:600, marginBottom:6 }}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color:p.color, fontSize:'0.8125rem', marginBottom:2 }}>
            {p.dataKey}: <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function TrendLine({ data, universities = ['ESPOCH','PUCE','UCE','UTPL','UG'], height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="year" tick={{ fill:'var(--text-muted)', fontSize:12 }} axisLine={false} tickLine={false} />
        <YAxis domain={[40,100]} tick={{ fill:'var(--text-subtle)', fontSize:11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ paddingTop:16, fontSize:'0.8125rem' }} />
        {universities.map(u => (
          <Line
            key={u}
            type="monotone"
            dataKey={u}
            stroke={COLORS[u]}
            strokeWidth={2.5}
            dot={{ fill:COLORS[u], strokeWidth:0, r:4 }}
            activeDot={{ r:6, strokeWidth:0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

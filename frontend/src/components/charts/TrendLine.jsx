import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';

// Paleta categórica fija; la serie «Promedio» se dibuja punteada y neutra.
const PALETTE = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];
const AVERAGE = 'Promedio';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ color:'var(--text)', fontWeight:600, marginBottom:6 }}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color:p.color, fontSize:'0.8125rem', marginBottom:2 }}>
            {p.dataKey}: <strong>{Number(p.value).toFixed(2)}%</strong>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function TrendLine({ data, universities = [], xKey = 'label', height = 280 }) {
  const values = data.flatMap(row => universities.map(u => row[u]).filter(v => typeof v === 'number'));
  const min = values.length ? Math.max(0, Math.floor(Math.min(...values) / 5) * 5 - 5) : 0;
  const max = values.length ? Math.min(100, Math.ceil(Math.max(...values) / 5) * 5 + 5) : 100;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey={xKey} tick={{ fill:'var(--text-muted)', fontSize:12 }} axisLine={false} tickLine={false} />
        <YAxis domain={[min, max]} tick={{ fill:'var(--text-subtle)', fontSize:11 }} axisLine={false} tickLine={false} unit="%" />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ paddingTop:16, fontSize:'0.8125rem' }} />
        {universities.map((u, index) => {
          const color = u === AVERAGE ? 'var(--text-muted)' : PALETTE[index % PALETTE.length];
          return (
            <Line
              key={u}
              type="monotone"
              dataKey={u}
              stroke={color}
              strokeWidth={u === AVERAGE ? 2 : 2.5}
              strokeDasharray={u === AVERAGE ? '6 4' : undefined}
              dot={u === AVERAGE ? false : { fill:color, strokeWidth:0, r:3 }}
              activeDot={{ r:5, strokeWidth:0 }}
              connectNulls
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

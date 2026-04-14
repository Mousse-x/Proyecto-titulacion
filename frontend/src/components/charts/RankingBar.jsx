import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList
} from 'recharts';
import { getScoreColor } from '../../data/mockData';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ color:'var(--text)', fontWeight:600, marginBottom:4 }}>{label}</div>
        <div style={{ color:'var(--primary-light)', fontSize:'0.875rem' }}>
          Score: <strong>{payload[0].value}</strong> / 100
        </div>
      </div>
    );
  }
  return null;
};

export default function RankingBar({ data, height = 300 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 20, bottom: 5, left: 0 }} barSize={32}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill:'var(--text-muted)', fontSize:12 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0,100]} tick={{ fill:'var(--text-subtle)', fontSize:11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill:'rgba(99,102,241,0.08)' }} />
        <Bar dataKey="transparency_score" radius={[6,6,0,0]}>
          <LabelList dataKey="transparency_score" position="top" style={{ fill:'var(--text-muted)', fontSize:11, fontWeight:600 }} />
          {data.map((entry) => (
            <Cell key={entry.name} fill={getScoreColor(entry.transparency_score)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

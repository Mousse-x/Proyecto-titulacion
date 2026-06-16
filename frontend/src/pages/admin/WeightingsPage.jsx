import { useEffect, useMemo, useState } from 'react';
import DonutChart from '../../components/charts/DonutChart';
import { api } from '../../api/client';

const palette = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];

const frameworkRows = [
  { name: 'LOTAIP', weight: 100, description: 'Indice nacional calculado con criterios LOTAIP.' },
  { name: 'OGP', weight: 15, description: 'Capa internacional de gobierno abierto.' },
  { name: 'OCDE', weight: 20, description: 'Capa internacional de calidad, metadatos e interoperabilidad.' },
  { name: 'ODS 16', weight: 10, description: 'Capa internacional de acceso publico, transparencia y rendicion de cuentas.' },
];

export default function WeightingsPage() {
  const [indicators, setIndicators] = useState([]);
  const [tab, setTab] = useState('categories');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.indicators.list()
      .then((res) => setIndicators(res.data || []))
      .catch(() => setIndicators([]))
      .finally(() => setLoading(false));
  }, []);

  const cats = useMemo(() => {
    const grouped = new Map();
    indicators.forEach((indicator) => {
      const key = indicator.category || 'Sin categoria';
      const current = grouped.get(key) || {
        name: key,
        weight: 0,
        indicators: 0,
        active: 0,
      };
      current.weight += Number(indicator.weight || 0);
      current.indicators += 1;
      if (indicator.is_active) current.active += 1;
      grouped.set(key, current);
    });

    return Array.from(grouped.values()).map((cat, index) => ({
      ...cat,
      weight: Number(cat.weight.toFixed(2)),
      color: palette[index % palette.length],
    }));
  }, [indicators]);

  const totalCat = Number(cats.reduce((sum, cat) => sum + Number(cat.weight || 0), 0).toFixed(2));
  const totalFw = frameworkRows.reduce((sum, fw) => sum + fw.weight, 0);

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Ponderaciones del Indice</h1>
          <p>Pesos reales obtenidos desde los indicadores registrados</p>
        </div>
      </div>

      <div className="tabs">
        {['categories', 'frameworks'].map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'categories' ? 'Por Categoria' : 'Por Marco Normativo'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><h4>Cargando ponderaciones...</h4></div></div>
      ) : tab === 'categories' && (
        <div className="grid-21">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Pesos por categoria</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: totalCat === 100 ? 'var(--success)' : 'var(--warning)' }}>
                Total: {totalCat}%
              </span>
            </div>
            {cats.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {cats.map((cat) => (
                  <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: cat.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>{cat.name}</span>
                    <span className="tag">{cat.active}/{cat.indicators} activos</span>
                    <div style={{ width: 74, textAlign: 'right', fontWeight: 800 }}>{cat.weight}%</div>
                    <div className="progress-bar" style={{ width: 100 }}>
                      <div className="progress-fill" style={{ width: `${Math.min(100, cat.weight)}%`, background: cat.color }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h4>Sin indicadores</h4>
                <p>Registra indicadores para calcular ponderaciones reales.</p>
              </div>
            )}
          </div>
          <div className="chart-card">
            <div className="chart-title">Distribucion actual</div>
            {cats.length ? <DonutChart data={cats} /> : <div className="empty-state"><h4>Sin datos para graficar</h4></div>}
            <div style={{ marginTop: 16, padding: '12px 14px', background: totalCat === 100 ? 'var(--success-subtle)' : 'var(--warning-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: totalCat === 100 ? 'var(--success)' : 'var(--warning)' }}>
                {totalCat === 100 ? 'Distribucion valida: suma 100%' : `Suma actual: ${totalCat}%. Revisa los pesos en Gestion de Indicadores.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'frameworks' && (
        <div className="grid-21">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Marcos usados por el evaluador</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Puntos maximos: {totalFw}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {frameworkRows.map((fw) => (
                <div key={fw.name} style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text)' }}>{fw.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{fw.description}</div>
                    </div>
                    <div style={{ fontWeight: 900 }}>{fw.weight} pts</div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(fw.weight / totalFw) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Descripcion de marcos</div>
            {frameworkRows.map((fw) => (
              <div key={fw.name} style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{fw.name}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{fw.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

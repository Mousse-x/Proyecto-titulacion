import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { NAV_BY_ROLE } from '../components/layout/navConfig';
import {
  DIMENSIONS, ERROR_HELP, FAQ, GLOSSARY, PAGE_HELP, SHORTCUTS, STATUS_HELP,
} from '../help/helpContent';
import { pageKey } from '../components/layout/navConfig';

const normalize = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SECTIONS = [
  ['inicio-rapido', 'Inicio rápido'],
  ['indice', 'Qué es el ITI'],
  ['dimensiones', 'Las ocho dimensiones'],
  ['estados', 'Estados de los resultados'],
  ['pantallas', 'Guía por pantalla'],
  ['errores', 'Mensajes de error'],
  ['atajos', 'Atajos de teclado'],
  ['preguntas', 'Preguntas frecuentes'],
  ['glosario', 'Glosario'],
];

const ROLE_TASKS = {
  1: [
    'Registrar o editar universidades en «Universidades».',
    'Cargar o importar documentos en «Documentos LOTAIP».',
    'Ejecutar la evaluación LOTAIP y la internacional en «Evaluación de transparencia».',
    'Consultar «Rankings» y exportar «Reportes».',
  ],
  2: [
    'Cargar las evidencias de tu institución en «Documentos LOTAIP».',
    'Revisar el resultado en «Evaluación de transparencia» e «Índice de Transparencia».',
    'Atender las «Observaciones» del auditor y generar «Reportes».',
  ],
  4: [
    'Consultar el «Índice de Transparencia» de cada universidad.',
    'Comparar instituciones en «Comparativas» y «Rankings».',
    'Revisar indicadores, fuentes y evidencias en «Evaluación de transparencia» y exportar «Reportes».',
  ],
};

export default function HelpPage() {
  const { user } = useAuth();
  const role = Number(user?.role_id);
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const match = (...texts) => !q || texts.some((t) => normalize(t).includes(q));

  const pages = useMemo(() => {
    const seen = new Set();
    return (NAV_BY_ROLE[role] || [])
      .filter((i) => !i.section)
      .map((i) => ({ ...i, help: PAGE_HELP[pageKey(i.to)] }))
      .filter((i) => i.help && !seen.has(i.to) && seen.add(i.to));
  }, [role]);

  const glossary = GLOSSARY.filter((g) => match(g.term, g.def));
  const faq = FAQ.filter((f) => match(f.q, f.a));
  const errors = ERROR_HELP.filter((e) => match(e.msg, e.fix));
  const visiblePages = pages.filter((p) => match(p.label, p.help.purpose, ...(p.help.steps || [])));

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Centro de ayuda</h1>
          <p>Cómo usar SisTransp, qué significa cada resultado y cómo resolver los mensajes de error.</p>
        </div>
      </div>

      <div className="help-search">
        <label className="form-label" htmlFor="help-search">Buscar en la ayuda</label>
        <input id="help-search" className="form-input" type="search" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej.: ITI, provisional, cargar documento, error técnico, reporte…" />
      </div>

      <div className="help-page">
        <nav className="help-toc card" aria-label="Contenido de la ayuda">
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <div>
          {!q && (
            <section id="inicio-rapido" className="card help-section">
              <h2>Inicio rápido · {user?.role_name}</h2>
              <ol>
                {(ROLE_TASKS[role] || ROLE_TASKS[2]).map((t) => <li key={t}>{t}</li>)}
              </ol>
              <p>En cualquier pantalla pulsa <strong>Ayuda</strong> (arriba a la derecha) para ver instrucciones de esa pantalla, o <kbd>Ctrl</kbd> + <kbd>K</kbd> para buscar una pantalla o universidad.</p>
            </section>
          )}

          {match('ITI indice transparencia institucional nacional internacional provisional', ...GLOSSARY.slice(0, 4).map((g) => g.def)) && (
            <section id="indice" className="card help-section">
              <h2>¿Qué es el Índice de Transparencia Institucional (ITI)?</h2>
              <p>
                Es un resultado único de 0 a 100 % que resume la transparencia activa de una universidad. Combina dos componentes
                que en la aplicación se muestran siempre por separado:
              </p>
              <div className="help-grid">
                <div className="help-item">
                  <strong>Componente nacional · LOTAIP</strong>
                  <p>Cumplimiento de los 24 numerales del artículo 19 de la LOTAIP, a partir de los documentos del Portal Nacional de Transparencia. Se resume en el SITA.</p>
                </div>
                <div className="help-item">
                  <strong>Componente internacional · complementario</strong>
                  <p>Indicadores de referentes internacionales (OGP, OCDE, ODS 16, WCAG, Open Data Charter) verificados con evidencia web citada. Se evalúa una vez al año.</p>
                </div>
              </div>
              <p style={{ marginTop: 12 }}>Ambos alimentan 58 indicadores agrupados en ocho dimensiones. Cada indicador se califica 0, 0,5 o 1:</p>
              <div className="help-formula">Dd = 100 × Σ(wᵢ × sᵢ) / Σ(wᵢ) &nbsp;·&nbsp; ITI = Σ(W_d × D_d) &nbsp;·&nbsp; SITA = (CTA + ETA + RP + CI) / 4</div>
              <p>
                <strong>Clasificación:</strong> Alto ≥ 90 % · Medio 70–89 % · Bajo 40–69 % · Crítico &lt; 40 %.
                El ITI es <strong>Provisional</strong> mientras falten indicadores por resolver y <strong>Definitivo</strong> cuando todos tienen resultado.
              </p>
            </section>
          )}

          {match('dimension', ...DIMENSIONS.map((d) => `${d.code} ${d.name} ${d.desc}`)) && (
            <section id="dimensiones" className="card help-section">
              <h2>Las ocho dimensiones del ITI</h2>
              <div className="help-grid">
                {DIMENSIONS.filter((d) => match('dimension', d.code, d.name, d.desc)).map((d) => (
                  <div className="help-item" key={d.code}>
                    <strong>{d.code} · {d.name}</strong>
                    <span>{d.desc}</span>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 12 }}>El peso de cada dimensión se configura en «Ponderaciones» y debe sumar 100 %.</p>
            </section>
          )}

          {match('estado cumple sin evidencia error tecnico pendiente', ...STATUS_HELP.map((s) => s.label + s.def)) && (
            <section id="estados" className="card help-section">
              <h2>Estados de los resultados</h2>
              <p>La aplicación distingue la <strong>ausencia de evidencias</strong>, el <strong>incumplimiento</strong> y el <strong>error técnico</strong> de procesamiento:</p>
              <dl className="help-status-list">
                {STATUS_HELP.map((s) => (
                  <div key={s.label}>
                    <dt><span className={`badge badge-${s.kind}`}>{s.label}</span></dt>
                    <dd>{s.def}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {visiblePages.length > 0 && (
            <section id="pantallas" className="card help-section">
              <h2>Guía por pantalla</h2>
              <div style={{ display: 'grid', gap: 14 }}>
                {visiblePages.map((p) => (
                  <div className="help-item" key={p.to}>
                    <strong><Link to={p.to}>{p.label}</Link></strong>
                    <p>{p.help.purpose}</p>
                    {p.help.steps?.length > 0 && (
                      <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: '0.85rem', color: 'var(--text)' }}>
                        {p.help.steps.map((s) => <li key={s}>{s}</li>)}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {errors.length > 0 && (
            <section id="errores" className="card help-section">
              <h2>Mensajes de error y cómo resolverlos</h2>
              <p>Los errores marcados como <span className="error-kind">Error técnico</span> no dependen de tus datos: pulsa «Reintentar». Los demás indican qué corregir.</p>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Mensaje</th><th>Qué hacer</th></tr></thead>
                  <tbody>
                    {errors.map((e) => <tr key={e.msg}><td><strong>{e.msg}</strong></td><td>{e.fix}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!q && (
            <section id="atajos" className="card help-section">
              <h2>Atajos de teclado</h2>
              <div className="table-wrapper">
                <table className="table">
                  <tbody>
                    {SHORTCUTS.map((s) => (
                      <tr key={s.desc}>
                        <td style={{ whiteSpace: 'nowrap' }}>{s.keys.map((k, i) => <span key={k}>{i > 0 && ' + '}<kbd>{k}</kbd></span>)}</td>
                        <td>{s.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {faq.length > 0 && (
            <section id="preguntas" className="card help-section help-faq">
              <h2>Preguntas frecuentes</h2>
              {faq.map((f) => (
                <details key={f.q} open={!!q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </section>
          )}

          {glossary.length > 0 && (
            <section id="glosario" className="card help-section">
              <h2>Glosario</h2>
              <div className="help-grid">
                {glossary.map((g) => (
                  <div className="help-item" key={g.term}>
                    <strong>{g.term}</strong>
                    <span>{g.def}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {q && !glossary.length && !faq.length && !errors.length && !visiblePages.length && (
            <div className="card empty-state">
              <h4>Sin resultados para «{query}»</h4>
              <p>Prueba con otra palabra, por ejemplo «ITI», «documento» o «reporte».</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

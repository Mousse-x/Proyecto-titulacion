import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { NAV_BY_ROLE, pageKey } from '../components/layout/navConfig';
import {
  DIMENSIONS, ERROR_HELP, FAQ, GLOSSARY, PAGE_HELP, SHORTCUTS, STATUS_HELP,
} from '../help/helpContent';

const normalize = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Íconos de línea sencillos (24×24) para cada sección. */
const ICON_PATHS = {
  rocket: <><path d="M5 15c-1.5 1.5-2 4-2 6c2 0 4.5-.5 6-2" /><path d="M9 15l-3-3c1-4 4.5-8 12-9c-1 7.5-5 11-9 12Z" /><circle cx="14.5" cy="9.5" r="1.5" /></>,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /><circle cx="12" cy="18" r="1" /></>,
  layers: <><path d="M12 3l9 5l-9 5l-9-5l9-5Z" /><path d="M3 13l9 5l9-5" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4l2 4H5" /></>,
  screen: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  alert: <><path d="M12 3l10 18H2L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17v.01" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 1 2-2h13" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  arrow: <path d="M5 12h14M13 6l6 6l-6 6" />,
};
function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICON_PATHS[name]}</svg>
  );
}

const SECTIONS = [
  { id: 'inicio-rapido', label: 'Inicio rápido', icon: 'rocket', desc: 'Lo primero que debes hacer' },
  { id: 'indice', label: 'Qué es el ITI', icon: 'gauge', desc: 'Cómo se mide la transparencia' },
  { id: 'dimensiones', label: 'Las ocho dimensiones', icon: 'layers', desc: 'Los temas que se evalúan' },
  { id: 'estados', label: 'Estados de los resultados', icon: 'flag', desc: 'Qué significa cada etiqueta' },
  { id: 'pantallas', label: 'Guía por pantalla', icon: 'screen', desc: 'Paso a paso de cada módulo' },
  { id: 'errores', label: 'Mensajes de error', icon: 'alert', desc: 'Cómo resolver cada uno' },
  { id: 'atajos', label: 'Atajos de teclado', icon: 'keyboard', desc: 'Trabaja más rápido' },
  { id: 'preguntas', label: 'Preguntas frecuentes', icon: 'question', desc: 'Dudas más comunes' },
  { id: 'glosario', label: 'Glosario', icon: 'book', desc: 'Términos y siglas' },
];
const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

const SCALE = [
  { label: 'Alto', range: '90 % o más', kind: 'success' },
  { label: 'Medio', range: '70 – 89 %', kind: 'info' },
  { label: 'Bajo', range: '40 – 69 %', kind: 'warning' },
  { label: 'Crítico', range: 'menos de 40 %', kind: 'danger' },
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
    'Corregir lo que indica «Observaciones» y generar «Reportes».',
  ],
  4: [
    'Consultar el «Índice de Transparencia» de cada universidad.',
    'Comparar instituciones en «Comparativas» y «Rankings».',
    'Revisar indicadores, fuentes y evidencias en «Evaluación de transparencia» y exportar «Reportes».',
  ],
};

function Section({ id, children, extra }) {
  const s = SECTION_BY_ID[id];
  return (
    <section id={id} className="card help-section">
      <header className="help-section-head">
        <span className="help-section-icon"><Icon name={s.icon} size={20} /></span>
        <div>
          <h2>{s.label}</h2>
          <p>{s.desc}</p>
        </div>
        {extra}
      </header>
      {children}
    </section>
  );
}

export default function HelpPage() {
  const { user } = useAuth();
  const role = Number(user?.role_id);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(SECTIONS[0].id);
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
  const dimensions = DIMENSIONS.filter((d) => match('dimension', d.code, d.name, d.desc));
  const showIndex = match('ITI indice transparencia institucional nacional internacional provisional', ...GLOSSARY.slice(0, 4).map((g) => g.def));
  const showStatus = match('estado cumple sin evidencia error tecnico pendiente', ...STATUS_HELP.map((s) => s.label + s.def));

  const visible = {
    'inicio-rapido': !q,
    indice: showIndex,
    dimensiones: dimensions.length > 0,
    estados: showStatus,
    pantallas: visiblePages.length > 0,
    errores: errors.length > 0,
    atajos: !q,
    preguntas: faq.length > 0,
    glosario: glossary.length > 0,
  };
  const anyVisible = Object.values(visible).some(Boolean);

  /* Resalta en el índice la sección que se está leyendo. */
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
      if (!nodes.length) return;
      /* La última sección cuyo título ya pasó la franja superior es la que se está leyendo. */
      const last = nodes[nodes.length - 1];
      const atBottom = last.getBoundingClientRect().bottom <= window.innerHeight + 4;
      const current = atBottom ? last : (nodes.filter((n) => n.getBoundingClientRect().top <= 180).pop() || nodes[0]);
      setActive(current.id);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    /* En captura: el desplazamiento puede ocurrir en un contenedor interno, no en window. */
    window.addEventListener('scroll', onScroll, true);
    return () => { window.removeEventListener('scroll', onScroll, true); if (frame) cancelAnimationFrame(frame); };
  }, [q]);

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="help-hero">
        <div className="help-hero-text">
          <span className="help-hero-kicker">Centro de ayuda</span>
          <h1>¿En qué te podemos ayudar?</h1>
          <p>Cómo usar SisTransp, qué significa cada resultado y cómo resolver los mensajes de error.</p>
        </div>
        <label className="help-hero-search" htmlFor="help-search">
          <Icon name="search" size={20} />
          <span className="sr-only">Buscar en la ayuda</span>
          <input id="help-search" type="search" value={query} autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca un tema: ITI, provisional, cargar documento, reporte…" />
        </label>
        {q && <div className="help-hero-result">{anyVisible ? `Resultados para «${query.trim()}»` : `Sin resultados para «${query.trim()}»`}</div>}
      </div>

      {!q && (
        <div className="help-topics">
          {SECTIONS.slice(1).map((s) => (
            <a key={s.id} href={`#${s.id}`} className="help-topic">
              <span className="help-topic-icon"><Icon name={s.icon} size={20} /></span>
              <span><strong>{s.label}</strong><small>{s.desc}</small></span>
            </a>
          ))}
        </div>
      )}

      <div className="help-page">
        <nav className="help-toc card" aria-label="Contenido de la ayuda">
          <div className="help-toc-title">Contenido</div>
          {SECTIONS.filter((s) => visible[s.id]).map((s) => (
            <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'active' : ''} aria-current={active === s.id ? 'true' : undefined}>
              <Icon name={s.icon} size={16} />{s.label}
            </a>
          ))}
        </nav>

        <div className="help-content">
          {visible['inicio-rapido'] && (
            <Section id="inicio-rapido" extra={user?.role_name && <span className="badge badge-primary help-role">{user.role_name}</span>}>
              <ol className="help-steps-list">
                {(ROLE_TASKS[role] || ROLE_TASKS[2]).map((t, i) => <li key={t}><span>{i + 1}</span>{t}</li>)}
              </ol>
              <div className="help-callout">
                En cualquier pantalla pulsa <strong>Ayuda</strong> (arriba a la derecha) para ver las instrucciones de esa pantalla,
                o <kbd>Ctrl</kbd> + <kbd>K</kbd> para buscar una pantalla o universidad.
              </div>
            </Section>
          )}

          {visible.indice && (
            <Section id="indice">
              <p className="help-lead">
                Es una nota de <strong>0 a 100 %</strong> que resume qué tan transparente es una universidad. Se arma con dos partes:
              </p>
              <div className="help-grid help-grid-2">
                <div className="help-item help-item-accent">
                  <strong>Parte nacional · LOTAIP</strong>
                  <p>Revisa los 24 numerales del artículo 19 de la LOTAIP con los documentos del Portal Nacional de Transparencia.</p>
                </div>
                <div className="help-item help-item-accent">
                  <strong>Parte internacional · complementaria</strong>
                  <p>Revisa buenas prácticas internacionales (OGP, OCDE, ODS 16, WCAG, Open Data Charter) con evidencia en la web. Se evalúa una vez al año.</p>
                </div>
              </div>
              <ol className="help-flow">
                <li><span>1</span>Cada uno de los 58 indicadores se califica: cumple, cumple en parte o no cumple.</li>
                <li><span>2</span>Cada dimensión saca una nota de 0 a 100; los indicadores con más peso cuentan más.</li>
                <li><span>3</span>Las 8 dimensiones se combinan según su peso y sale el ITI.</li>
              </ol>
              <div className="help-subtitle">Clasificación</div>
              <div className="help-scale">
                {SCALE.map((s) => (
                  <div key={s.label} className={`help-scale-item help-scale-${s.kind}`}>
                    <strong>{s.label}</strong><span>{s.range}</span>
                  </div>
                ))}
              </div>
              <p className="help-muted">
                El ITI es <strong>Provisional</strong> mientras falten indicadores por resolver y <strong>Definitivo</strong> cuando todos tienen resultado.
              </p>
            </Section>
          )}

          {visible.dimensiones && (
            <Section id="dimensiones">
              <div className="help-grid">
                {dimensions.map((d) => (
                  <div className="help-item help-dim" key={d.code}>
                    <span className="help-dim-code">{d.code}</span>
                    <div><strong>{d.name}</strong><span>{d.desc}</span></div>
                  </div>
                ))}
              </div>
              <p className="help-muted">El peso de cada dimensión se configura en «Ponderaciones» y debe sumar 100 %.</p>
            </Section>
          )}

          {visible.estados && (
            <Section id="estados">
              <p className="help-lead">La aplicación distingue la <strong>falta de evidencias</strong>, el <strong>incumplimiento</strong> y el <strong>error técnico</strong>:</p>
              <div className="help-status-grid">
                {STATUS_HELP.map((s) => (
                  <div key={s.label} className="help-status-card">
                    <span className={`badge badge-${s.kind}`}>{s.label}</span>
                    <p>{s.def}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {visible.pantallas && (
            <Section id="pantallas">
              <div className="help-accordion">
                {visiblePages.map((p) => (
                  <details key={p.to} open={!!q}>
                    <summary>
                      <span><strong>{p.label}</strong><small>{p.help.purpose}</small></span>
                    </summary>
                    <div className="help-accordion-body">
                      {p.help.steps?.length > 0 && (
                        <ol className="help-steps-list help-steps-sm">
                          {p.help.steps.map((s, i) => <li key={s}><span>{i + 1}</span>{s}</li>)}
                        </ol>
                      )}
                      <Link className="btn btn-sm btn-secondary help-go" to={p.to}>Ir a {p.label} <Icon name="arrow" size={14} /></Link>
                    </div>
                  </details>
                ))}
              </div>
            </Section>
          )}

          {visible.errores && (
            <Section id="errores">
              <p className="help-lead">Si el mensaje dice <span className="error-kind">Error técnico</span>, no depende de tus datos: pulsa «Reintentar». Los demás te indican qué corregir.</p>
              <div className="help-error-list">
                {errors.map((e) => (
                  <div key={e.msg} className="help-error">
                    <div className="help-error-msg"><Icon name="alert" size={16} />{e.msg}</div>
                    <p>{e.fix}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {visible.atajos && (
            <Section id="atajos">
              <div className="help-shortcuts">
                {SHORTCUTS.map((s) => (
                  <div key={s.desc} className="help-shortcut">
                    <span className="help-shortcut-keys">{s.keys.map((k, i) => <span key={k}>{i > 0 && <em>+</em>}<kbd>{k}</kbd></span>)}</span>
                    <span>{s.desc}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {visible.preguntas && (
            <Section id="preguntas">
              <div className="help-accordion">
                {faq.map((f) => (
                  <details key={f.q} open={!!q}>
                    <summary><span><strong>{f.q}</strong></span></summary>
                    <div className="help-accordion-body"><p>{f.a}</p></div>
                  </details>
                ))}
              </div>
            </Section>
          )}

          {visible.glosario && (
            <Section id="glosario">
              <div className="help-grid">
                {glossary.map((g) => (
                  <div className="help-item" key={g.term}>
                    <strong>{g.term}</strong>
                    <span>{g.def}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!anyVisible && (
            <div className="card empty-state">
              <h4>Sin resultados para «{query.trim()}»</h4>
              <p>Prueba con otra palabra, por ejemplo «ITI», «documento» o «reporte».</p>
              <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>Limpiar búsqueda</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { NAV_BY_ROLE, ROLE_PREFIX } from './navConfig';

const normalize = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/*
 * Búsqueda rápida (Ctrl + K): localiza pantallas y universidades y permite ir
 * directamente a su evaluación, índice o documentos (H7.1, H7.3).
 */
export default function CommandPalette({ open, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [universities, setUniversities] = useState([]);
  const [loadingUnivs, setLoadingUnivs] = useState(false);

  const role = Number(user?.role_id);
  const prefix = ROLE_PREFIX[role] || '';

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
      if (!universities.length) setLoadingUnivs(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    if (!universities.length) {
      api.universities.list()
        .then((r) => setUniversities(Array.isArray(r.data) ? r.data : []))
        .catch(() => {})
        .finally(() => setLoadingUnivs(false));
    }
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => {
    const pages = (NAV_BY_ROLE[role] || [])
      .filter((i) => !i.section)
      .map((i) => ({ group: 'Pantallas', label: i.label, hint: 'Ir a la pantalla', to: i.to }));
    const univItems = universities.flatMap((u) => {
      const name = `${u.name} — ${u.full_name || ''}`;
      const list = [{
        group: 'Universidades',
        label: name,
        hint: 'Ver evaluación (indicadores y evidencias)',
        to: `${prefix}/validation?university_id=${u.id}`,
        keywords: `${u.city || ''} ${u.province || ''}`,
      }];
      if (role !== 1) {
        list.push({ group: 'Universidades', label: name, hint: 'Ver Índice de Transparencia', to: `${prefix}/index?university_id=${u.id}` });
      }
      list.push({ group: 'Universidades', label: name, hint: 'Ver documentos LOTAIP', to: `${prefix}/documents?university_id=${u.id}` });
      return list;
    });
    const all = [...pages, ...univItems];
    const q = normalize(query.trim());
    if (!q) return pages;
    return all.filter((i) => normalize(`${i.label} ${i.hint} ${i.keywords || ''}`).includes(q)).slice(0, 30);
  }, [role, prefix, universities, query]);

  if (!open) return null;

  const go = (item) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
  };


  return (
    <div className="modal-overlay palette-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Búsqueda rápida">
        <div className="palette-input-wrap">
          <span aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Busca una pantalla o universidad (siglas, nombre, ciudad)…"
            aria-label="Buscar pantalla o universidad"
            aria-controls="palette-results"
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-results" id="palette-results" role="listbox">
          {items.length === 0 && (
            <li className="palette-empty">
              {loadingUnivs ? 'Cargando universidades…' : `Sin resultados para «${query}». Prueba con las siglas (p. ej. ESPOCH).`}
            </li>
          )}
          {items.map((item, idx) => {
            const header = idx === 0 || items[idx - 1].group !== item.group ? item.group : null;
            return (
              <li key={`${item.to}-${idx}`} role="presentation">
                {header && <div className="palette-group">{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === active}
                  className={`palette-item${idx === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => go(item)}
                >
                  <span className="palette-item-label">{item.label}</span>
                  <span className="palette-item-hint">{item.hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}

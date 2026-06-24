import { useState, useEffect, useCallback } from 'react';
import DataTable from '../../components/common/DataTable';
import Modal, { ConfirmModal } from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { ScoreCard } from '../../components/common/StatCard';
import { api } from '../../api/client';
import { getUniversityLogo } from '../../data/universityLogos';

const normalizeUniversityType = (value = 'Pública') => String(value)
  .replaceAll('PÃºblica', 'Pública')
  .replaceAll('Publica', 'Pública');

const EMPTY = { name: '', full_name: '', city: '', province: '', type: 'Pública', website: '', dpe_entity_id: '', logo_file: null, logo_url: '', is_active: true };

export default function UniversitiesPage() {
  const [univs, setUnivs]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [modal, setModal]       = useState(false);
  const [confirm, setConfirm]   = useState({ open: false, id: null });
  const [form, setForm]         = useState(EMPTY);
  const [detailView, setDetail] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [dpeHelpOpen, setDpeHelpOpen] = useState(false);

  const fetchUnivs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.universities.list({ include_inactive: 1 });
      setUnivs(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar universidades. Ã‚Â¿EstÃƒÂ¡ el servidor activo?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUnivs(); }, [fetchUnivs]);

  const openCreate = () => { setSelected(null); setForm(EMPTY); setModal(true); };
  const openEdit   = (u)  => { setSelected(u); setForm({ name: u.name, full_name: u.full_name, city: u.city || '', province: u.province || '', type: normalizeUniversityType(u.type || 'Pública'), website: u.website || '', dpe_entity_id: u.dpe_entity_id || '', logo_file: null, logo_url: u.logo_url || '', is_active: u.is_active }); setModal(true); };

  const extractDpeId = (value = '') => {
    const match = String(value).match(/(?:entidades\/)?(\d+)/);
    return match ? match[1] : String(value).trim();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (selected) {
        await api.universities.update(selected.id, form);
      } else {
        await api.universities.create(form);
      }
      setModal(false);
      await fetchUnivs();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.universities.remove(id);
      setConfirm({ open: false, id: null });
      await fetchUnivs();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar universidad.');
    }
  };

  const columns = [
    { key: 'name', label: 'InstituciÃ³n', render: (v, row) => {
      const logo = getUniversityLogo(row);
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: logo ? '#fff' : `${row.color}22`, border: logo ? '1px solid var(--border)' : `1px solid ${row.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 800, color: row.color, flexShrink: 0, padding: logo ? 4 : 0 }}>
            {logo ? <img src={logo} alt={`Logo ${row.full_name || row.name}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : row.logo_initials}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{v}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{row.city}{row.province ? `, ${row.province}` : ''}</div>
          </div>
        </div>
      );
    }},
    { key: 'type', label: 'Tipo', render: (v) => <Badge status={normalizeUniversityType(v)} /> },
    { key: 'transparency_score', label: 'Ãndice', sortable: true,
      render: (v) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ScoreCard score={v} size={44} />
        </div>
      )
    },
    { key: 'is_active', label: 'Estado', render: (v) => <Badge status={v ? 'Activo' : 'Inactivo'} /> },
    { key: 'id', label: 'Acciones', sortable: false, render: (_, row) => (
      <div className="table-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => setDetail(row)}>Ver</button>
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Editar</button>
        <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ open: true, id: row.id })}>Eliminar</button>
      </div>
    )},
  ];

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Universidades</h1>
          <p>{loading ? 'Cargando...' : `${univs.length} instituciones registradas en el sistema`}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={fetchUnivs} disabled={loading}>Actualizar</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Agregar Universidad</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
            Cargando universidades...
          </div>
        ) : error ? (
          <div className="alert alert-danger" style={{ margin: 24 }}>Alerta: {error}</div>
        ) : univs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>UN</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No hay universidades registradas</div>
            <div style={{ fontSize: '0.875rem' }}>Agrega la primera institucion con el boton "+ Agregar Universidad"</div>
          </div>
        ) : (
          <DataTable columns={columns} data={univs} searchKeys={['name', 'full_name', 'city', 'province']} />
        )}
      </div>

      {/* Detail modal */}
      {detailView && (
        <Modal isOpen={!!detailView} onClose={() => setDetail(null)} title={`Universidad ${detailView.full_name || detailView.name}`} size="lg">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              ['Siglas', detailView.name],
              ['Nombre completo', detailView.full_name],
              ['Tipo', detailView.type],
              ['Ciudad', detailView.city],
              ['Provincia', detailView.province],
              ['Sitio web', detailView.website],
              ['ID DPE', detailView.dpe_entity_id],
              ['URL DPE', detailView.transparency_url],
            ].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k}</div>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{v || '-'}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, padding: '16px', background: 'var(--primary-subtle)', borderRadius: 'var(--radius)', border: '1px solid rgba(99,102,241,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Indice de Transparencia</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--primary-light)', letterSpacing: '-0.04em' }}>{detailView.transparency_score ?? 0}</div>
          </div>
        </Modal>
      )}

      {/* Edit/Create modal */}
      <Modal isOpen={modal} onClose={() => setModal(false)}
        title={selected ? 'Editar Universidad' : '+ Nueva Universidad'}
        footer={<><button className="btn btn-secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button></>}
        size="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            ['name', 'Siglas (ej: ESPOCH)', 'text'],
            ['full_name', 'Nombre completo', 'text'],
            ['city', 'Ciudad', 'text'],
            ['province', 'Provincia', 'text'],
            ['website', 'Sitio web', 'url'],
          ].map(([k, l, t]) => (
            <div className="form-group" key={k}>
              <label className="form-label">{l}</label>
              <input className="form-input" type={t} value={form[k] || ''} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} />
            </div>
          ))}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <label className="form-label" htmlFor="univ-dpe-id">ID DPE Transparencia</label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDpeHelpOpen(true)}>
                Ayuda
              </button>
            </div>
            <input
              id="univ-dpe-id"
              className="form-input"
              type="text"
              placeholder="Ej: 1365 o https://transparencia.dpe.gob.ec/entidades/1365"
              value={form.dpe_entity_id || ''}
              onChange={e => setForm(p => ({ ...p, dpe_entity_id: extractDpeId(e.target.value) }))}
            />
            <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-subtle)', lineHeight: 1.4 }}>
              Puedes pegar el enlace completo del portal DPE; el sistema tomara solo el numero.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Logo de la universidad</label>
            <input
              className="form-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={e => {
                const file = e.target.files?.[0] || null;
                setForm(p => ({ ...p, logo_file: file }));
              }}
            />
            {(form.logo_file || form.logo_url) && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 52, height: 52, borderRadius: 8, background: '#fff', border: '1px solid var(--border)', padding: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={form.logo_file ? URL.createObjectURL(form.logo_file) : form.logo_url} alt="Vista previa del logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                  {form.logo_file ? form.logo_file.name : 'Logo actual'}
                </span>
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option>Pública</option>
              <option>Particular cofinanciada</option>
              <option>Particular autofinanciada</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
            <input type="checkbox" id="univ-active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
            <label htmlFor="univ-active" style={{ fontSize: '0.875rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Universidad activa</label>
          </div>
        </div>
      </Modal>

      <Modal isOpen={dpeHelpOpen} onClose={() => setDpeHelpOpen(false)} title="Como encontrar el ID DPE" size="lg">
        <div style={{ display: 'grid', gap: 16, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <p>
            El ID DPE es el numero que aparece al final de la pagina de transparencia de cada institucion en el portal de la Defensoria del Pueblo.
          </p>
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Pasos</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>Ingresa al portal de transparencia DPE.</li>
              <li>Busca la universidad o institucion.</li>
              <li>Abre su ficha de transparencia.</li>
              <li>Copia el numero que esta despues de <strong>/entidades/</strong> en la URL.</li>
            </ol>
          </div>
          <div style={{ background: 'var(--primary-subtle)', border: '1px solid rgba(99,102,241,0.24)', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Ejemplo</div>
            <div style={{ fontFamily: 'monospace', overflowWrap: 'anywhere', color: 'var(--text)' }}>
              https://transparencia.dpe.gob.ec/entidades/1365
            </div>
            <div style={{ marginTop: 8 }}>
              En este caso, el ID que debes ingresar es <strong style={{ color: 'var(--primary-light)' }}>1365</strong>.
            </div>
          </div>
          <a className="btn btn-primary" href="https://transparencia.dpe.gob.ec/entidades/" target="_blank" rel="noreferrer" style={{ justifySelf: 'start', textDecoration: 'none' }}>
            Abrir portal DPE
          </a>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirm.open} onClose={() => setConfirm({ open: false, id: null })}
        onConfirm={() => handleDelete(confirm.id)}
        title="Eliminar universidad" message="Â¿Eliminar esta universidad? TambiÃ©n se eliminarÃ¡n todos sus documentos, validaciones y archivos asociados." danger
      />
    </div>
  );
}

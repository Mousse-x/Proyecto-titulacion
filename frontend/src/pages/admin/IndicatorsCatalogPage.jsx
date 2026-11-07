import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfirm, useToast } from '../../context/FeedbackContext';
import ErrorNotice from '../../components/common/ErrorNotice';
import DataTable from '../../components/common/DataTable';
import Modal, { ConfirmModal } from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { api, MEDIA_BASE } from '../../api/client';

const TYPES = {
  LOTAIP: { label: 'LOTAIP', classification: 'NACIONAL' },
  MIXTO: { label: 'Mixto', classification: 'MIXTO' },
  COMPLEMENTARIO: { label: 'Complementario', classification: 'INTERNACIONAL' },
};

const EMPTY = { type: 'LOTAIP', code: '', name: '', dimension_id: '', weight: 0, is_active: true };
const typeFromClassification = (value) => value === 'MIXTO' ? 'MIXTO' : 'COMPLEMENTARIO';
const templateHref = (url) => url?.startsWith('http') ? url : `${MEDIA_BASE}${url || ''}`;

export default function IndicatorsCatalogPage() {
  const [indicators, setIndicators] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, indicator: null });
  const [templateIndicator, setTemplateIndicator] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [filterType, setFilterType] = useState('');
  const [saving, setSaving] = useState(false);
  const [templateUploading, setTemplateUploading] = useState(false);
  const fileRef = useRef(null);

  const fetchIndicators = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lotaipResponse, integratedResponse] = await Promise.all([
        api.indicators.list(),
        api.transparencyModel.get(),
      ]);
      const modelDimensions = integratedResponse.data?.dimensions || [];
      const lotaipRows = (lotaipResponse.data || []).map((indicator) => ({
        ...indicator,
        backend_id: indicator.id,
        id: `lotaip-${indicator.id}`,
        source: 'lotaip',
        type: 'LOTAIP',
        type_label: TYPES.LOTAIP.label,
        dimension_code: '',
        dimension_name: 'Catálogo documental LOTAIP',
      }));
      const integratedRows = modelDimensions.flatMap((dimension) =>
        (dimension.indicators || [])
          .filter((indicator) => indicator.classification !== 'NACIONAL')
          .map((indicator) => {
            const type = typeFromClassification(indicator.classification);
            return {
              ...indicator,
              backend_id: indicator.id,
              id: `integrated-${indicator.id}`,
              source: 'integrated',
              type,
              type_label: TYPES[type].label,
              name: indicator.statement,
              dimension_code: dimension.code,
              dimension_name: dimension.name,
            };
          }),
      );
      setDimensions(modelDimensions);
      setIndicators([...lotaipRows, ...integratedRows]);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIndicators(); }, [fetchIndicators]);

  const filtered = useMemo(() => (
    filterType ? indicators.filter((indicator) => indicator.type === filterType) : indicators
  ), [filterType, indicators]);

  const counts = useMemo(() => Object.keys(TYPES).reduce((result, type) => ({
    ...result,
    [type]: indicators.filter((indicator) => indicator.type === type).length,
  }), {}), [indicators]);

  const toast = useToast();
  const confirmAction = useConfirm();

  const openCreate = () => {
    setForm({ ...EMPTY, dimension_id: dimensions[0]?.id ? String(dimensions[0].id) : '' });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.warning({ title: 'Revisa el formulario', message: 'El código y el nombre del indicador son obligatorios.' });
      return;
    }
    if (form.type !== 'LOTAIP' && !form.dimension_id) {
      toast.warning({ title: 'Revisa el formulario', message: 'Selecciona la dimensión (D1–D8) a la que pertenece el indicador.' });
      return;
    }
    setSaving(true);
    try {
      if (form.type === 'LOTAIP') {
        await api.indicators.create({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          description: '',
          weight: 0,
          is_active: form.is_active,
        });
      } else {
        await api.transparencyModel.createIndicator({
          code: form.code.trim().toUpperCase(),
          statement: form.name.trim(),
          classification: TYPES[form.type].classification,
          dimension_id: Number(form.dimension_id),
          weight: Number(form.weight || 0),
          is_active: form.is_active,
        });
      }
      setModal(false);
      toast.success({ title: 'Indicador guardado', message: `${form.code.trim().toUpperCase()} se registró correctamente.` });
      await fetchIndicators();
    } catch (err) {
      toast.apiError(err, 'No se pudo guardar el indicador. Tus datos siguen en el formulario.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const indicator = confirm.indicator;
    if (!indicator) return;
    try {
      if (indicator.source === 'lotaip') await api.indicators.remove(indicator.backend_id);
      else await api.transparencyModel.deleteIndicator(indicator.backend_id);
      setConfirm({ open: false, indicator: null });
      toast.success({ title: 'Indicador eliminado', message: indicator.code });
      await fetchIndicators();
    } catch (err) {
      toast.apiError(err, 'No se pudo eliminar el indicador.');
    }
  };

  const handleTemplateUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !templateIndicator) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv'].includes(ext)) {
      toast.error({ title: 'Formato no permitido', message: 'La plantilla debe ser PDF, XLSX, XLS, DOCX, DOC o CSV.' });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error({ title: 'Archivo demasiado grande', message: 'La plantilla no debe superar 50 MB.' });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    const payload = new FormData();
    payload.append('file', file);
    setTemplateUploading(true);
    try {
      const response = await api.indicators.uploadTemplate(templateIndicator.backend_id, payload);
      setTemplateIndicator((current) => ({
        ...current,
        template_url: response.data.url,
        template_name: response.data.name,
      }));
      toast.success({ title: 'Plantilla cargada', message: file.name });
      await fetchIndicators();
    } catch (err) {
      toast.apiError(err, 'No se pudo subir la plantilla LOTAIP.');
    } finally {
      setTemplateUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleTemplateDelete = async () => {
    if (!templateIndicator) return;
    const ok = await confirmAction({
      title: 'Eliminar plantilla',
      message: `¿Eliminar la plantilla base del indicador ${templateIndicator.code || ''}? Podrás subir otra en cualquier momento.`,
      confirmLabel: 'Eliminar plantilla',
      danger: true,
    });
    if (!ok) return;
    setTemplateUploading(true);
    try {
      await api.indicators.deleteTemplate(templateIndicator.backend_id);
      setTemplateIndicator((current) => ({ ...current, template_url: null, template_name: null }));
      toast.success({ title: 'Plantilla eliminada' });
      await fetchIndicators();
    } catch (err) {
      toast.apiError(err, 'No se pudo eliminar la plantilla LOTAIP.');
    } finally {
      setTemplateUploading(false);
    }
  };

  const columns = [
    {
      key: 'code', label: 'Código',
      render: (value) => <span style={{ fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '3px 8px', borderRadius: 5, fontSize: '0.8125rem', color: 'var(--primary)' }}>{value}</span>,
    },
    {
      key: 'name', label: 'Indicador',
      render: (value, row) => (
        <div style={{ minWidth: 260, maxWidth: 620 }}>
          <div style={{ fontWeight: 650, color: 'var(--text)', fontSize: '0.875rem', lineHeight: 1.4 }}>{value}</div>
          {row.type === 'LOTAIP' && (
            <div style={{ marginTop: 4, fontSize: '0.72rem', color: row.template_url ? 'var(--success)' : 'var(--text-subtle)' }}>
              {row.template_url ? `Plantilla: ${row.template_name || 'documento base disponible'}` : 'Sin plantilla base'}
            </div>
          )}
          {row.type !== 'LOTAIP' && <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Peso dentro de la dimensión: {Number(row.weight || 0).toFixed(1).replace('.0', '')}%</div>}
        </div>
      ),
    },
    { key: 'type_label', label: 'Tipo', render: (value) => <Badge status={value} /> },
    {
      key: 'dimension_name', label: 'Ámbito',
      render: (value, row) => (
        <div>
          {row.dimension_code && <strong style={{ color: 'var(--primary)', marginRight: 6 }}>{row.dimension_code}</strong>}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{value}</span>
        </div>
      ),
    },
    { key: 'is_active', label: 'Estado', render: (value) => <Badge status={value ? 'Activo' : 'Inactivo'} /> },
    {
      key: 'id', label: 'Acciones', sortable: false,
      render: (_, row) => (
        <div className="table-actions">
          {row.type === 'LOTAIP' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setTemplateIndicator(row)}>Plantilla</button>
          )}
          <button className="btn btn-danger btn-sm" title={`Eliminar ${row.code}`} onClick={() => setConfirm({ open: true, indicator: row })}>Eliminar</button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Indicadores de Transparencia</h1>
          <p>{loading ? 'Cargando...' : `${indicators.length} indicadores · ${counts.LOTAIP || 0} LOTAIP · ${counts.MIXTO || 0} mixtos · ${counts.COMPLEMENTARIO || 0} complementarios`}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={fetchIndicators} disabled={loading}>Actualizar</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Nuevo indicador</button>
        </div>
      </div>

      <div className="search-bar" style={{ marginBottom: 20 }}>
        <select className="form-input" style={{ width: 'auto' }} value={filterType} onChange={(event) => setFilterType(event.target.value)}>
          <option value="">Todos los tipos</option>
          {Object.entries(TYPES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
        </select>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-subtle)' }}>{filtered.length} indicadores</span>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />Cargando indicadores...</div>
        ) : error ? (
          <ErrorNotice error={error} fallback="No se pudieron cargar los indicadores." onRetry={fetchIndicators} style={{ margin: 24 }} />
        ) : indicators.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📋</div><h4>No hay indicadores registrados</h4><p>Agrega un indicador LOTAIP, mixto o complementario.</p></div>
        ) : (
          <DataTable columns={columns} data={filtered} searchKeys={['code', 'name', 'type_label', 'dimension_name']} />
        )}
      </div>

      <Modal
        isOpen={modal}
        onClose={() => !saving && setModal(false)}
        title="Nuevo indicador"
        footer={<><button className="btn btn-secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar indicador'}</button></>}
        size="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Tipo de indicador *</label>
            <select className="form-input" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value, weight: 0 }))}>
              {Object.entries(TYPES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Código *</label>
            <input className="form-input" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="Ej: LOTAIP-25 o CI-59" />
          </div>
          {form.type !== 'LOTAIP' && (
            <>
              <div className="form-group">
                <label className="form-label">Dimensión *</label>
                <select className="form-input" value={form.dimension_id} onChange={(event) => setForm((current) => ({ ...current, dimension_id: event.target.value }))}>
                  <option value="">Selecciona una dimensión</option>
                  {dimensions.map((dimension) => <option key={dimension.id} value={dimension.id}>{dimension.code} · {dimension.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Peso dentro de la dimensión (%)</label>
                <input className="form-input" type="number" min="0" max="100" step="0.1" value={form.weight} onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))} />
              </div>
            </>
          )}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Nombre o enunciado del indicador *</label>
            <textarea className="form-input" rows={4} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, gridColumn: '1 / -1' }}>
            <input type="checkbox" id="indicator-active" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />
            <label htmlFor="indicator-active" style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}>Indicador activo</label>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!templateIndicator}
        onClose={() => !templateUploading && setTemplateIndicator(null)}
        title={`Plantilla LOTAIP · ${templateIndicator?.code || ''}`}
        footer={<button className="btn btn-secondary" onClick={() => setTemplateIndicator(null)} disabled={templateUploading}>Cerrar</button>}
      >
        <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.55 }}>
          Esta plantilla sirve como documento base para validar la estructura de las evidencias asociadas al indicador.
        </p>
        {templateIndicator?.template_url ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
              <span style={{ fontSize: '1.5rem' }}>📊</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {templateIndicator.template_name || 'Plantilla base'}
                </div>
                <div style={{ marginTop: 3, color: 'var(--success)', fontSize: '0.75rem' }}>Plantilla disponible</div>
              </div>
              <a className="btn btn-secondary btn-sm" href={templateHref(templateIndicator.template_url)} target="_blank" rel="noopener noreferrer">Descargar</a>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={templateUploading}>
                {templateUploading ? 'Subiendo...' : 'Reemplazar plantilla'}
              </button>
              <button className="btn btn-danger" onClick={handleTemplateDelete} disabled={templateUploading}>Eliminar plantilla</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 22, borderRadius: 9, border: '1px dashed var(--border)', background: 'var(--bg-tertiary)', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Sin plantilla base</div>
            <p style={{ margin: '0 0 16px', color: 'var(--text-subtle)', fontSize: '0.8rem' }}>Sube un archivo XLSX, XLS o CSV para este indicador.</p>
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={templateUploading}>
              {templateUploading ? 'Subiendo...' : 'Subir plantilla'}
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleTemplateUpload} style={{ display: 'none' }} />
      </Modal>

      <ConfirmModal
        isOpen={confirm.open}
        onClose={() => setConfirm({ open: false, indicator: null })}
        onConfirm={handleDelete}
        title="Eliminar indicador"
        message={confirm.indicator?.source === 'integrated'
          ? `¿Eliminar ${confirm.indicator?.code}? También se eliminarán sus resultados de evaluación asociados.`
          : `¿Eliminar ${confirm.indicator?.code}? Esta acción no se puede deshacer.`}
        danger
      />
    </div>
  );
}

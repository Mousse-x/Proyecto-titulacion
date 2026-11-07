import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import { api } from '../../api/client';
import { useToast } from '../../context/FeedbackContext';

/*
 * Corrige los datos de un documento cargado (H3.2). El título se edita en sitio;
 * para cambiar el archivo, la universidad, el literal o el mes se usa «Reemplazar».
 */
export default function EditDocumentModal({ doc, onClose, onSaved, onReplace, reviewerId }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setTitle(doc?.title || '');
    setTouched(false);
  }, [doc]);

  if (!doc) return null;

  const trimmed = title.trim();
  const error = !trimmed ? 'El título es obligatorio.' : trimmed.length > 255 ? 'Usa como máximo 255 caracteres.' : '';
  const dirty = trimmed !== (doc.title || '').trim();

  const save = async () => {
    setTouched(true);
    if (error) return;
    setSaving(true);
    try {
      await api.evidences.update(doc.id, { title: trimmed, _reviewer_id: reviewerId });
      toast.success({ title: 'Documento actualizado', message: `El título ahora es «${trimmed}».` });
      onSaved?.();
      onClose();
    } catch (err) {
      toast.apiError(err, 'No se pudo actualizar el documento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!doc}
      onClose={onClose}
      dirty={dirty}
      busy={saving}
      title="Editar documento"
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}
            title={!dirty ? 'No hay cambios por guardar' : undefined}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-doc-title">Título del documento<span className="required-mark" aria-hidden="true">*</span></label>
          <input id="edit-doc-title" className={`form-input${touched && error ? ' is-invalid' : ''}`} value={title}
            onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus />
          {touched && error && <div className="field-error">{error}</div>}
        </div>
        <div className="confirm-details">
          <div><strong>Universidad:</strong> {doc.university_name || '—'}</div>
          <div><strong>Literal:</strong> {doc.indicator_code} {doc.indicator_name ? `· ${doc.indicator_name}` : ''}</div>
          <div><strong>Período:</strong> {doc.year || '—'}{doc.month ? ` · mes ${doc.month}` : ''}</div>
        </div>
        {onReplace && (
          <div className="alert alert-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>¿El archivo, el literal o el mes son incorrectos? Reemplaza el documento.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onClose(); onReplace(doc); }}>
              Reemplazar archivo
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

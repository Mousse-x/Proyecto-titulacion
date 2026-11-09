import { getScoreColor, getScoreInk } from '../../utils/score';
/* Estados de los paquetes LOTAIP (resultado por literal). */
export const PACKAGE_STATUS = {
  PENDIENTE_REVISION: { label: 'Pendiente de comprobación', badge: 'badge-warning', color: 'var(--warning)' },
  NO_VERIFICABLE: { label: 'No verificable automáticamente', badge: 'badge-warning', color: 'var(--warning)' },
  CUMPLE: { label: 'Cumple', badge: 'badge-success', color: 'var(--success)' },
  CUMPLE_PARCIALMENTE: { label: 'Cumple parcialmente', badge: 'badge-warning', color: 'var(--warning)' },
  INCOMPLETO: { label: 'Incompleto', badge: 'badge-info', color: 'var(--info)' },
  NO_CUMPLE: { label: 'No cumple', badge: 'badge-danger', color: 'var(--danger)' },
  NO_PRESENTADO: { label: 'No presentado', badge: 'badge-subtle', color: 'var(--text-subtle)' },
  ERROR_PROCESAMIENTO: { label: 'Error', badge: 'badge-danger', color: 'var(--danger)' },
};

/* Estados de los indicadores del modelo integrado. */
export const INDICATOR_STATUS = {
  CUMPLE: { label: 'Cumple', badge: 'badge-success', color: 'var(--success)' },
  PARCIAL: { label: 'Cumple parcialmente', badge: 'badge-warning', color: 'var(--warning)' },
  NO_CUMPLE: { label: 'No cumple', badge: 'badge-danger', color: 'var(--danger)' },
  SIN_EVIDENCIA: { label: 'Sin evidencia', badge: 'badge-subtle', color: 'var(--text-subtle)' },
  NO_APLICA: { label: 'No aplica', badge: 'badge-subtle', color: 'var(--text-subtle)' },
  PENDIENTE: { label: 'Pendiente', badge: 'badge-warning', color: 'var(--warning)' },
  ERROR_TECNICO: { label: 'Error técnico', badge: 'badge-danger', color: 'var(--danger)' },
};

/* Estado de cada verificable comprobado dentro de un criterio. */
export const CHECK_STATUS = {
  SI: { label: 'Cumple', badge: 'badge-success' },
  NO: { label: 'No cumple', badge: 'badge-danger' },
  PENDIENTE: { label: 'Pendiente', badge: 'badge-warning' },
  'SIN EVALUACIÓN': { label: 'Sin evaluación', badge: 'badge-subtle' },
};

/* De dónde proviene cada resultado internacional. */
export function resultOrigin(metadata = {}) {
  switch (metadata.origen) {
    case 'referencia_documental':
      return { label: 'Referencia documental', badge: 'badge-primary', hint: 'Investigación documental con evidencia citada.' };
    case 'medicion_tecnica':
      return { label: 'Medición técnica', badge: 'badge-info', hint: 'Medido automáticamente sobre el portal o los datos publicados.' };
    case 'simulado':
      return { label: 'Dato simulado', badge: 'badge-warning', hint: 'Generado con el comando datos_demo; no es una evaluación real.' };
    default:
      return metadata.evaluation_mode === 'tecnico'
        ? { label: 'Medición técnica', badge: 'badge-info', hint: 'Medido automáticamente sobre el portal o los datos publicados.' }
        : { label: 'Evaluación automática', badge: 'badge-subtle', hint: 'Búsqueda web y análisis con IA.' };
  }
}

/* Escala A–E compartida con toda la app (utils/score.js): color para rellenos, ink para texto. */
export const scoreColor = (score) => (score == null ? 'var(--text-subtle)' : getScoreColor(score));
export const scoreInk = (score) => (score == null ? 'var(--text-subtle)' : getScoreInk(score));

/* Calificación de un criterio LOTAIP (0, 0.5, 1, SI, NO…) como texto y color. */
export function criterionGrade(criterion) {
  if (!criterion.aplica) return { label: 'No aplica', badge: 'badge-subtle' };
  const value = criterion.calificacion;
  if (value == null) return { label: 'Pendiente', badge: 'badge-warning' };
  if (value === 'SI' || Number(value) === 1) return { label: value === 'SI' ? 'Sí cumple' : '1 · Cumple', badge: 'badge-success' };
  if (value === 'NO' || Number(value) === 0) return { label: value === 'NO' ? 'No cumple' : '0 · No cumple', badge: 'badge-danger' };
  if (value === 'SIN EVALUACIÓN') return { label: 'Sin evaluación', badge: 'badge-subtle' };
  return { label: `${String(value).replace('.', ',')} · Parcial`, badge: 'badge-warning' };
}

/** Constantes y utilidades compartidas por la evaluación en curso (EvaluationContext). */
export const SCOPE_LABEL = {
  lotaip: 'Evaluación nacional LOTAIP',
  international: 'Evaluación internacional',
  pending: 'Reintento de comprobaciones pendientes',
};

export const sameTarget = (a, b) => Boolean(a && b)
  && String(a.universityId || '') === String(b.universityId || '')
  && String(a.periodId || '') === String(b.periodId || '')
  && String(a.month || '') === String(b.month || '');

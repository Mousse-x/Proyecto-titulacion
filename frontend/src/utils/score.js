/*
 * Escala de aprobación en 5 niveles (A–E), con la paleta tipo semáforo
 * verde oscuro → verde claro → amarillo → naranja → rojo.
 *   color: para rellenos (barras, anillos, gráficos).
 *   ink:   la misma tonalidad, más oscura, para texto legible sobre fondo claro.
 * Los valores viven en index.css (--score-a … --score-e y sus variantes -ink).
 */
export const SCORE_SCALE = [
  { min: 80, grade: 'A', label: 'Alto', color: 'var(--score-a)', ink: 'var(--score-a-ink)' },
  { min: 60, grade: 'B', label: 'Medio alto', color: 'var(--score-b)', ink: 'var(--score-b-ink)' },
  { min: 40, grade: 'C', label: 'Medio', color: 'var(--score-c)', ink: 'var(--score-c-ink)' },
  { min: 20, grade: 'D', label: 'Bajo', color: 'var(--score-d)', ink: 'var(--score-d-ink)' },
  { min: -Infinity, grade: 'E', label: 'Crítico', color: 'var(--score-e)', ink: 'var(--score-e-ink)' },
];

export const getScoreLevel = (score) => {
  const value = Number(score) || 0;
  return SCORE_SCALE.find((level) => value >= level.min);
};

export const getScoreColor = (score) => getScoreLevel(score).color;
export const getScoreInk = (score) => getScoreLevel(score).ink;
export const getScoreGrade = (score) => getScoreLevel(score).grade;
export const getScoreLabel = (score) => getScoreLevel(score).label;

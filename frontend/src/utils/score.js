export const getScoreColor = (score) => {
  const value = Number(score) || 0;
  if (value >= 90) return 'var(--success)';
  if (value >= 70) return 'var(--warning)';
  if (value >= 40) return 'var(--info)';
  return 'var(--danger)';
};

export const getScoreLabel = (score) => {
  const value = Number(score) || 0;
  if (value >= 90) return 'Alto';
  if (value >= 70) return 'Medio';
  if (value >= 40) return 'Bajo';
  return 'Critico';
};

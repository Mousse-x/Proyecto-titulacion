const normalizeStatus = (value = '') => String(value)
  .replaceAll('PÃºblica', 'Pública')
  .replaceAll('En revisiÃ³n', 'En revisión')
  .replaceAll('Publica', 'Pública');

export default function Badge({ status }) {
  const label = normalizeStatus(status);
  const map = {
    "Aprobado":    "success", "Activo":      "success", "Resuelta":    "success",
    "En revisión": "warning", "En proceso":  "info",    "Pendiente":   "warning",
    "Rechazado":   "danger",  "Inactivo":    "danger",
    "LOTAIP":      "primary", "Mixto":       "warning", "Complementario": "info",
    "OGP":         "info",    "OCDE":        "primary",
    "ODS":         "success", "Alta":        "danger",  "Media":       "warning",
    "Baja":        "info",    "Pública":     "primary", "Particular cofinanciada": "info",
    "Alto": "score-a", "Medio alto": "score-b", "Medio": "score-c", "Bajo": "score-d", "Crítico": "score-e", "Critico": "score-e",
    "Provisional": "warning", "Definitivo": "success", "Particular autofinanciada": "info",
  };
  const cls = map[label] || 'subtle';
  return <span className={`badge badge-${cls}`}>{label}</span>;
}

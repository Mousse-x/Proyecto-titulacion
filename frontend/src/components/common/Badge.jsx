export default function Badge({ status }) {
  const map = {
    "Aprobado":    "success", "Activo":      "success", "Resuelta":    "success",
    "En revisión": "warning", "En proceso":  "info",    "Pendiente":   "warning",
    "Rechazado":   "danger",  "Inactivo":    "danger",
    "LOTAIP":      "primary", "OGP":         "info",    "OCDE":        "primary",
    "ODS":         "success", "Alta":        "danger",  "Media":       "warning",
    "Baja":        "info",    "Pública":     "primary", "Particular cofinanciada": "info",
  };
  const cls = map[status] || 'subtle';
  return <span className={`badge badge-${cls}`}>{status}</span>;
}

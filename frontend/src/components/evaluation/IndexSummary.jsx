import { Link } from 'react-router-dom';
import { formatLotaipPercent } from '../../utils/lotaipDashboard';
import { MeterRow, ScoreRing } from './widgets';

/* Las tres calificaciones de la página: nacional, internacional e índice final. */
export default function IndexSummary({ lotaip, summary, national, international, integrated, documentTotal }) {
  return (
    <div className="eval-summary">
      <div className="card eval-index-card">
        <ScoreRing value={lotaip?.sita ?? null} />
        <div>
          <div className="eval-index-kicker">Componente nacional · LOTAIP</div>
          <div className="eval-index-title">SITA <Link to="/ayuda#indice" className="info-button" title="SITA = (CTA + ETA + RP + CI) / 4" aria-label="Ayuda sobre el SITA">?</Link></div>
          <span className={`badge ${!lotaip ? 'badge-subtle' : lotaip.isProvisional ? 'badge-warning' : 'badge-success'}`}>
            {lotaip ? (lotaip.isProvisional ? 'Provisional' : 'Definitivo') : 'Sin evaluar'}
          </span>
          {lotaip && (
            <div className="eval-meters">
              <MeterRow label="CTA" value={lotaip.cta} hint="Información completa y actualizada" />
              <MeterRow label="ETA" value={lotaip.eta} hint="Estructura de datos abiertos" />
              <MeterRow label="RP" value={lotaip.rp} hint="Registro dentro del plazo" />
              <MeterRow label="CI" value={lotaip.ci} hint="Calidad de la información" />
            </div>
          )}
          <div className="eval-index-meta" style={{ marginTop: 8 }}>
            <strong>{lotaip?.formats ?? summary?.sita?.formatos ?? 0}</strong> formatos · <strong>{documentTotal}</strong> documentos
            {lotaip?.isProvisional && lotaip.sitaMin != null && lotaip.sitaMax != null && (
              <> · rango {formatLotaipPercent(lotaip.sitaMin)} – {formatLotaipPercent(lotaip.sitaMax)}</>
            )}
          </div>
          <div className="eval-index-help">Cumplimiento de los 24 numerales del art. 19 de la LOTAIP (Portal DPE).</div>
        </div>
      </div>

      <div className="card eval-index-card">
        <ScoreRing value={international?.score ?? null} />
        <div>
          <div className="eval-index-kicker">Componente complementario · internacional</div>
          <div className="eval-index-title">Indicadores internacionales <Link to="/ayuda#indice" className="info-button" title="OGP, OCDE, ODS 16, WCAG y Open Data Charter" aria-label="Ayuda sobre el componente internacional">?</Link></div>
          <span className={`badge ${international?.score == null ? 'badge-subtle' : international?.is_provisional ? 'badge-warning' : 'badge-success'}`}>
            {international?.score == null ? 'Sin evaluar' : international?.is_provisional ? 'Pendiente' : 'Definitivo'}
          </span>
          <div className="eval-index-meta" style={{ marginTop: 8 }}>
            <strong>{international?.resolved || 0}</strong> de {international?.total || 34} indicadores resueltos
            {integrated?.international_year && <> · evaluación anual {integrated.international_year}</>}
            {!!international?.no_evidence && <><br />{international.no_evidence} sin evidencia publicada (puntúan 0)</>}
            {!!international?.technical_errors && <><br /><span style={{ color: 'var(--danger)' }}>{international.technical_errors} con error técnico (reintentables)</span></>}
          </div>
          <div className="eval-index-help">Referentes OGP, OCDE, ODS 16, WCAG y Open Data Charter; evaluación anual.</div>
        </div>
      </div>

      <div className="card eval-index-card featured">
        <ScoreRing value={integrated?.index_percent ?? null} />
        <div>
          <div className="eval-index-kicker">Resultado final</div>
          <div className="eval-index-title">Índice de Transparencia Institucional (ITI) <Link to="/ayuda#dimensiones" className="info-button" title="Qué son las 8 dimensiones del ITI" aria-label="Ayuda sobre el ITI y sus dimensiones">?</Link></div>
          <span className={`badge ${integrated?.index_percent == null ? 'badge-subtle' : integrated?.is_provisional ? 'badge-warning' : 'badge-success'}`}>
            {integrated?.index_percent == null ? 'Esperando ambas evaluaciones' : integrated?.is_provisional ? 'Provisional' : 'Definitivo'}
          </span>
          <div className="eval-index-meta" style={{ marginTop: 8 }}>
            <strong>{integrated?.coverage?.resolved || 0}</strong> de {integrated?.coverage?.total || 58} indicadores resueltos
            {national?.score != null && <><br />Nacional normalizado: <strong>{Number(national.score).toFixed(2)}%</strong></>}
            {international?.score != null && <><br />Internacional: <strong>{Number(international.score).toFixed(2)}%</strong></>}
          </div>
          <div className="eval-index-help">Integra ambos componentes en 58 indicadores y 8 dimensiones (D1–D8) ponderadas.</div>
        </div>
      </div>
    </div>
  );
}

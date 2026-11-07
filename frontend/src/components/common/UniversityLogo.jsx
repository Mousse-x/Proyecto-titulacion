import { getUniversityLogo } from '../../data/universityLogos';

export default function UniversityLogo({ university = {}, name = '' }) {
  const logo = getUniversityLogo(university);
  const label = university.full_name || university.name || name || 'Universidad';
  const initials = university.logo_initials || university.name || name || 'UNIV';
  const color = university.color || 'var(--primary)';

  return (
    <div
      className="doc-icon"
      title={`Escudo de ${label}`}
      style={{
        width: 44,
        height: 44,
        borderRadius: 9,
        background: logo ? '#fff' : 'var(--primary-subtle)',
        border: logo ? '1px solid var(--border)' : `1px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: logo ? 4 : 0,
        color,
        fontSize: '0.68rem',
        fontWeight: 800,
        overflow: 'hidden',
      }}
    >
      {logo ? (
        <img
          src={logo}
          alt={`Escudo de ${label}`}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : String(initials).slice(0, 4).toUpperCase()}
    </div>
  );
}

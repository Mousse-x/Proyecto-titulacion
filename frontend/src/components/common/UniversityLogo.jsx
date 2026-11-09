import { getUniversityLogo } from '../../data/universityLogos';

export default function UniversityLogo({ university = {}, name = '', size = 44 }) {
  const logo = getUniversityLogo(university);
  const label = university.full_name || university.name || name || 'Universidad';
  const initials = university.logo_initials || university.name || name || 'UNIV';
  const color = university.color || 'var(--primary)';

  return (
    <div
      className="doc-icon"
      title={`Escudo de ${label}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 5),
        background: logo ? '#fff' : 'var(--primary-subtle)',
        border: logo ? '1px solid var(--border)' : `1px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: logo ? Math.round(size / 11) : 0,
        color,
        fontSize: size > 60 ? `${size / 70}rem` : '0.68rem',
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

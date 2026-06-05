import epnLogo from '../assets/university-logos/epn.png';
import espeLogo from '../assets/university-logos/espe.png';
import unlLogo from '../assets/university-logos/unl.jpg';

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

const LOGOS = [
  {
    logo: epnLogo,
    acronyms: ['EPN'],
    names: ['ESCUELA POLITECNICA NACIONAL'],
  },
  {
    logo: espeLogo,
    acronyms: ['ESPE'],
    names: ['UNIVERSIDAD DE LAS FUERZAS ARMADAS ESPE'],
  },
  {
    logo: unlLogo,
    acronyms: ['UNL'],
    names: ['UNIVERSIDAD NACIONAL DE LOJA'],
  },
];

export function getUniversityLogo(university = {}) {
  if (university.logo_url) return university.logo_url;

  const acronym = normalizeText(university.name || university.acronym || university.logo_initials);
  const fullName = normalizeText(university.full_name || university.nombre || university.institution || '');

  const match = LOGOS.find((item) => {
    const acronyms = item.acronyms.map(normalizeText);
    const names = item.names.map(normalizeText);
    return acronyms.includes(acronym) || names.some((name) => fullName.includes(name));
  });

  return match?.logo || null;
}

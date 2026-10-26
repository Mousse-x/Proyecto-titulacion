// Una nota por literal y mes; nunca se promedian las copias por archivo.
const isDictionary = (result) => /d(?:i|í)ccionario|dicionario/i.test(String(result.documento || ''));

export function groupLotaipPackages(results) {
  const groups = new Map();
  for (const result of results) {
    if (isDictionary(result)) continue;
    const key = result.rubrica_lotaip?.unidad
      || JSON.stringify([result.literal, result.periodo, result.month]);
    if (!groups.has(key)) groups.set(key, { ...result, packageKey: key, documents: [] });
    const group = groups.get(key);
    group.documents.push(result);
    if (!group.rubrica_lotaip && result.rubrica_lotaip) {
      Object.assign(group, result);
    }
  }
  return [...groups.values()];
}

export function pendingLotaipPackages(results) {
  return groupLotaipPackages(results).filter(result =>
    result.rubrica_lotaip?.criterios?.some(criterion =>
      criterion.aplica && criterion.calificacion == null));
}

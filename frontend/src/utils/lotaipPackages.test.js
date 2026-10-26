import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLotaipPackages, pendingLotaipPackages } from './lotaipPackages.js';

test('los tres documentos comparten una nota sin promediarla', () => {
  const results = [1, 2, 3].map(evidence_id => ({ evidence_id,
    rubrica_lotaip: { unidad: '1:2:8:9' }, puntaje_total: 75 }));
  const groups = groupLotaipPackages(results);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].documents.length, 3);
  assert.equal(groups[0].puntaje_total, 75);
});

test('mantiene separados literales y meses distintos', () => {
  const groups = groupLotaipPackages(['1:2:8:9', '1:2:9:9', '1:2:8:10']
    .map(unidad => ({ rubrica_lotaip: { unidad } })));
  assert.equal(groups.length, 3);
});

test('el diccionario apoya al paquete pero no aparece como evaluación propia', () => {
  const unidad = '1:2:8:9';
  const item = (documento) => ({ documento, rubrica_lotaip: { unidad } });
  const grouped = groupLotaipPackages([
    item('Conjunto de datos'),
    item('Metadatos'),
    item('1. Diccionario de datos.csv'),
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].documents.length, 2);
  assert.ok(grouped[0].documents.every(item => !item.documento.includes('Diccionario')));
});

test('reintenta una vez por paquete pendiente y omite resueltos y no aplicables', () => {
  const result = (unidad, aplica, calificacion) => ({
    rubrica_lotaip: { unidad, criterios: [{ aplica, calificacion }] },
  });
  const pending = pendingLotaipPackages([
    result('pendiente', true, null), result('pendiente', true, null),
    result('no', true, 'NO'), result('si', true, 'SI'),
    result('cero', true, 0), result('no-aplica', false, null), {},
  ]);
  assert.deepEqual(pending.map(r => r.packageKey), ['pendiente']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSummaryParams, getLotaipDashboard } from '../src/utils/lotaipDashboard.js';

const backendSummary = {
  national_index: null,
  sita: { resultado_automatico: { puntaje: 25.6 } },
  lotaip: {
    cta: 44, eta: 0, rp: 0, ci: 21.43, sita: 16.36,
    is_provisional: true, status: 'PROVISIONAL',
    engine_version: 'DPE-053-2024-v2.1', formats: 21,
  },
};

test('usa el SITA entregado por el backend y no el porcentaje legacy', () => {
  const result = getLotaipDashboard(backendSummary);
  assert.equal(result.sita, 16.36);
  assert.notEqual(result.sita, backendSummary.sita.resultado_automatico.puntaje);
});

test('no recalcula SITA a partir de los componentes', () => {
  const changed = structuredClone(backendSummary);
  changed.lotaip.sita = 12.34;
  assert.equal(getLotaipDashboard(changed).sita, 12.34);
});

test('presenta la ejecucion provisional y la version del motor', () => {
  const result = getLotaipDashboard(backendSummary);
  assert.equal(result.status, 'PROVISIONAL');
  assert.equal(result.isProvisional, true);
  assert.equal(result.engineVersion, 'DPE-053-2024-v2.1');
});

test('las estadisticas documentales no afectan al SITA', () => {
  const changed = { ...backendSummary, indicators_non_compliant: 999, evaluated_documents: 63 };
  assert.equal(getLotaipDashboard(changed).sita, 16.36);
});

test('una nueva consulta del dashboard evita reutilizar la respuesta HTTP anterior', () => {
  assert.deepEqual(freshSummaryParams(4, 11, 123), { periodo_id: 4, month: 11, _refresh: 123 });
});

test('muestra componentes y pendiente cuando aún no existe SITA', () => {
  const pending = structuredClone(backendSummary);
  pending.lotaip.sita = null;
  pending.lotaip.ci = null;
  const result = getLotaipDashboard(pending);
  assert.equal(result.cta, 44);
  assert.equal(result.sita, null);
  assert.equal(result.isProvisional, true);
});

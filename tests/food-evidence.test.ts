import assert from 'node:assert/strict';
import test from 'node:test';

import {
  confidenceProfile,
  contextFindings,
  equityRows,
  foodAnalysis,
  foodStudies,
  foodSyntheses,
} from '../src/lib/food-evidence';

const Z_95 = 1.95996398454;

function approx(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} ≈ ${expected} (tol ${tolerance})`);
}

test('synthetic food analysis exports are wired and safe for publication routes', () => {
  assert.equal(foodAnalysis.synthetic, true);
  assert.equal(foodStudies.length, 6);
  assert.equal(foodSyntheses.length, 2);
  assert.deepEqual(foodSyntheses.map((s) => s.id).sort(), ['all', 'lower-risk']);
  assert.deepEqual(foodStudies.map((s) => s.id), ['fs01-river-east', 'fs02-market-square', 'fs03-harbour-north', 'fs04-hill-ward', 'fs05-tram-corridor', 'fs06-lakeside-highrisk']);
  assert.equal(foodAnalysis.studies, foodStudies);
  assert.equal(foodAnalysis.syntheses, foodSyntheses);
  assert.ok(foodAnalysis.software.includes('statsmodels 0.14.5'));
  assert.ok(foodAnalysis.method.includes('Paule-Mandel'));
  assert.equal(foodAnalysis.intervention, 'Household-specific retailer offer: basket voucher and personalised product information');
  const serialized = JSON.stringify(foodAnalysis);
  assert.ok(!serialized.includes('releaseApproved'));
});

test('study-level formulas match risk-ratio, logRR and variance definitions', () => {
  for (const study of foodStudies) {
    const a = study.interventionEvents;
    const nI = study.interventionTotal;
    const c = study.controlEvents;
    const nC = study.controlTotal;
    assert.ok(a > 0 && c > 0);
    assert.ok(a < nI && c < nC);

    const logRR = Math.log((a / nI) / (c / nC));
    const variance = (1 / a) - (1 / nI) + (1 / c) - (1 / nC);
    const se = Math.sqrt(variance);
    const ciLow = Math.exp(logRR - (Z_95 * se));
    const ciHigh = Math.exp(logRR + (Z_95 * se));

    approx(study.effect.logRR, logRR);
    approx(study.effect.variance, variance);
    approx(study.effect.rr, Math.exp(logRR));
    approx(study.effect.ciLow, ciLow);
    approx(study.effect.ciHigh, ciHigh);
    assert.ok(study.effect.ciLow > 0);
  }
});

test('synthesis numbers match independent inverse-variance random-effects calculations', () => {
  const byId = new Map(foodStudies.map((study) => [study.id, study]));
  for (const synthesis of foodSyntheses) {
    const chosen = synthesis.studyIds.map((id) => byId.get(id)!);
    const tau2 = synthesis.tau2;
    const weights = chosen.map((study) => 1 / (study.effect.variance + tau2));
    const pooledLogRR = chosen.reduce((sum, study, i) => sum + (weights[i] * study.effect.logRR), 0) / weights.reduce((sum, w) => sum + w, 0);
    const pooledSe = Math.sqrt(1 / weights.reduce((sum, w) => sum + w, 0));

    approx(synthesis.rr, Math.exp(pooledLogRR));
    approx(synthesis.ciLow, Math.exp(pooledLogRR - (Z_95 * pooledSe)));
    approx(synthesis.ciHigh, Math.exp(pooledLogRR + (Z_95 * pooledSe)));

    const fixedWeights = chosen.map((study) => 1 / study.effect.variance);
    const fixedPooled = chosen.reduce((sum, study, i) => sum + (fixedWeights[i] * study.effect.logRR), 0) / fixedWeights.reduce((sum, w) => sum + w, 0);
    const q = chosen.reduce((sum, study, i) => sum + (fixedWeights[i] * ((study.effect.logRR - fixedPooled) ** 2)), 0);
    const i2 = q > 0 ? Math.max(0, ((q - (chosen.length - 1)) / q) * 100) : 0;
    approx(synthesis.q, q);
    approx(synthesis.i2, i2);
  }
});

test('auxiliary interpretation exports are complete and clearly synthetic', () => {
  assert.equal(confidenceProfile.length, 5);
  assert.deepEqual(confidenceProfile.map((row) => [row.domain, row.judgement]), [
    ['Risk of bias', 'Serious concerns (illustrative judgement)'],
    ['Inconsistency', 'No downgrade illustrated'],
    ['Indirectness', 'Serious concerns (illustrative judgement)'],
    ['Imprecision', 'Not assessed'],
    ['Publication/reporting bias', 'Not assessed'],
  ]);
  for (const row of confidenceProfile) {
    assert.ok(row.reason.toLowerCase().includes('synthetic') || row.reason.toLowerCase().includes('fabricated'));
  }
  assert.ok(contextFindings.length >= 3 && contextFindings.length <= 4);
  for (const finding of contextFindings) {
    assert.match(finding.source, /Invented|synthetic/i);
  }
  assert.ok(equityRows.length > 0 && equityRows.length <= 4);
});

test('numerical reference checks for pooled estimates (stable demo fixture)', () => {
  const all = foodSyntheses.find((item) => item.id === 'all')!;
  const lower = foodSyntheses.find((item) => item.id === 'lower-risk')!;
  approx(all.rr, 1.2293378429317061);
  approx(all.ciLow, 1.1056843175374196);
  approx(all.ciHigh, 1.3668200842622824);
  approx(lower.rr, 1.1605492747226627);
  approx(lower.ciLow, 1.048550161577319);
  approx(lower.ciHigh, 1.284511383826611);
  assert.ok(all.rr > lower.rr, 'high-risk study should materially increase pooled effect for sensitivity teaching');
});

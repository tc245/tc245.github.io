import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOUSEHOLD_COUNT,
  NETWORK_NODES,
  PROFILES,
  SHOPS,
  defaultScenarioSettings,
  runScenario,
  validateScenarioSettings,
} from '../src/lib/scenario';

test('runScenario is reproducible for the same settings and seed', () => {
  const settings = {
    ...defaultScenarioSettings(),
    selectedShopIds: ['shop-a', 'shop-c'],
    offerPrice: 12,
    extendHours: true,
  };
  const left = runScenario(settings);
  const right = runScenario(settings);
  assert.deepEqual(left, right);
});

test('baseline remains stable when policy toggles under fixed seed and travel assumption', () => {
  const baselineSettings = defaultScenarioSettings();
  const policySettings = {
    ...defaultScenarioSettings(),
    budget: 20_000,
    selectedShopIds: ['shop-a', 'shop-e', 'shop-f'],
    offerPrice: 18,
    extendHours: true,
  };
  const base = runScenario(baselineSettings);
  const policy = runScenario(policySettings);

  assert.deepEqual(base.baseline, policy.baseline);
  assert.deepEqual(
    base.households.map((household) => ({
      id: household.id,
      baselineShopId: household.baselineShopId,
      baselineRoute: household.baselineRoute,
      baselineMinutes: household.baselineMinutes,
    })),
    policy.households.map((household) => ({
      id: household.id,
      baselineShopId: household.baselineShopId,
      baselineRoute: household.baselineRoute,
      baselineMinutes: household.baselineMinutes,
    })),
  );
});

test('no intervention yields exact baseline-scenario equality', () => {
  const result = runScenario(defaultScenarioSettings());
  assert.deepEqual(result.baseline, result.scenario);
  for (const household of result.households) {
    assert.equal(household.baselineShopId, household.scenarioShopId);
    assert.deepEqual(household.baselineRoute, household.scenarioRoute);
    assert.equal(household.baselineMinutes, household.scenarioMinutes);
  }
});

test('cheaper prices and extended hours do not reduce accessibility', () => {
  const ids = SHOPS.map((shop) => shop.id);
  const expensive = runScenario({
    ...defaultScenarioSettings(),
    budget: 20_000,
    selectedShopIds: ids,
    offerPrice: 20,
    extendHours: false,
  });
  const cheaper = runScenario({
    ...defaultScenarioSettings(),
    budget: 20_000,
    selectedShopIds: ids,
    offerPrice: 10,
    extendHours: false,
  });
  const cheaperLongerHours = runScenario({
    ...defaultScenarioSettings(),
    budget: 20_000,
    selectedShopIds: ids,
    offerPrice: 10,
    extendHours: true,
  });

  assert.ok(cheaper.scenario.accessible >= expensive.scenario.accessible);
  assert.ok(cheaperLongerHours.scenario.accessible >= cheaper.scenario.accessible);
});

test('invalid settings and over-budget scenarios are rejected', () => {
  assert.throws(() => validateScenarioSettings({ ...defaultScenarioSettings(), seed: -1 }), /seed/);
  assert.throws(() => validateScenarioSettings({ ...defaultScenarioSettings(), selectedShopIds: ['shop-a', 'shop-a'] }), /duplicate/i);
  assert.throws(() => validateScenarioSettings({ ...defaultScenarioSettings(), travelAssumption: 2 }), /travelAssumption/);
  assert.throws(
    () => runScenario({
      ...defaultScenarioSettings(),
      budget: 1_000,
      selectedShopIds: ['shop-a'],
      extendHours: true,
    }),
    /exceeds/i,
  );
});

test('population has 4 profile groups with exactly 50 households each', () => {
  const result = runScenario(defaultScenarioSettings());
  assert.equal(result.households.length, HOUSEHOLD_COUNT);
  assert.equal(result.baseline.groups.length, PROFILES.length);
  assert.deepEqual(result.baseline.groups.map((group) => group.total), [50, 50, 50, 50]);
});

test('subgroup accessible counts sum to overall accessible counts', () => {
  const result = runScenario({
    ...defaultScenarioSettings(),
    budget: 20_000,
    selectedShopIds: ['shop-a', 'shop-c', 'shop-e'],
    offerPrice: 11,
    extendHours: true,
  });
  const baselineSum = result.baseline.groups.reduce((sum, group) => sum + group.accessible, 0);
  const scenarioSum = result.scenario.groups.reduce((sum, group) => sum + group.accessible, 0);
  assert.equal(baselineSum, result.baseline.accessible);
  assert.equal(scenarioSum, result.scenario.accessible);
  assert.equal(result.baseline.total, HOUSEHOLD_COUNT);
  assert.equal(result.scenario.total, HOUSEHOLD_COUNT);
});

test('route and minute calculations follow grid units and include 10-minute shopping time', () => {
  const result = runScenario(defaultScenarioSettings());
  const household = result.households.find((item) => item.baselineShopId !== null);
  assert.ok(household, 'Expected at least one household with baseline access.');
  const picked = household!;
  const shop = SHOPS.find((item) => item.id === picked.baselineShopId)!;
  const from = NETWORK_NODES[picked.nodeId];
  const to = NETWORK_NODES[shop.nodeId];
  const manhattan = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  assert.equal(picked.baselineRoute.length - 1, manhattan);
  assert.equal(picked.baselineRoute[0], picked.nodeId);
  assert.equal(picked.baselineRoute[picked.baselineRoute.length - 1], shop.nodeId);
  const expected = Math.round((((2 * manhattan * 100) / picked.speed) + 10) * 100) / 100;
  assert.equal(picked.baselineMinutes, expected);
});

test('variation bounds and sensitivity assumptions are deterministic and monotonic', () => {
  const result = runScenario({
    ...defaultScenarioSettings(),
    budget: 20_000,
    selectedShopIds: ['shop-b', 'shop-e'],
    offerPrice: 12,
    extendHours: true,
  });

  assert.equal(result.repetitions, 40);
  assert.ok(result.variation.baselineLow >= 0 && result.variation.baselineLow <= HOUSEHOLD_COUNT);
  assert.ok(result.variation.baselineHigh >= result.variation.baselineLow);
  assert.ok(result.variation.scenarioLow >= 0 && result.variation.scenarioLow <= HOUSEHOLD_COUNT);
  assert.ok(result.variation.scenarioHigh >= result.variation.scenarioLow);

  assert.deepEqual(result.sensitivity.map((item) => item.assumption), [0.8, 1, 1.2]);
  const [low, mid, high] = result.sensitivity;
  assert.ok(low.baselineAccessible <= mid.baselineAccessible);
  assert.ok(mid.baselineAccessible <= high.baselineAccessible);
  assert.ok(low.scenarioAccessible <= mid.scenarioAccessible);
  assert.ok(mid.scenarioAccessible <= high.scenarioAccessible);
});

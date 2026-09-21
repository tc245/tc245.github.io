import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { defaultScenarioSettings, runScenario } from '../src/lib/scenario';

type FoodAnalysis = {
  synthetic: true;
  studies: { id: string; interventionEvents: number; interventionTotal: number; controlEvents: number; controlTotal: number }[];
  syntheses: { id: 'all' | 'lower-risk'; rr: number; ciLow: number; ciHigh: number; k: number; studyIds: string[] }[];
};

const learningRoutes = {
  overview: '/learning/food-access/',
  effects: '/learning/food-access/effects/',
  context: '/learning/food-access/context/',
  confidence: '/learning/food-access/confidence/',
  scenario: '/learning/food-access/scenario/',
  study: '/learning/food-access/studies/fs01-river-east/',
} as const;

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function waitForScenario(page: Page) {
  await expect(page.locator('#scenario-error')).toBeHidden();
  await expect(page.locator('#scenario-results')).toBeVisible();
  await expect(page.locator('#scenario-status')).toContainText('Scenario complete');
}

function absoluteText(baselinePer100: number, rr: number, ciLow: number, ciHigh: number) {
  const rate = (baselinePer100 * rr).toFixed(1);
  const ci = `${(baselinePer100 * ciLow).toFixed(1)}–${(baselinePer100 * ciHigh).toFixed(1)} per 100 using the pooled confidence limits`;
  const difference = baselinePer100 * (rr - 1);
  const diffText = `${Math.abs(difference).toFixed(1)} ${difference >= 0 ? 'more' : 'fewer'} per 100 under these assumptions`;
  return { rate, ci, diffText };
}

async function setRange(page: Page, id: string, value: number) {
  await page.locator(`#${id}`).evaluate((node, newValue) => {
    const input = node as HTMLInputElement;
    input.value = String(newValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('worked example is reachable from homepage and section tabs navigate correctly', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Open the worked example' }).click();
  await expect(page).toHaveURL(learningRoutes.overview);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('What changes access to healthier food?');

  const tabs = page.getByRole('navigation', { name: 'Worked example' });
  await tabs.getByRole('link', { name: 'Effects', exact: true }).click();
  await expect(page).toHaveURL(learningRoutes.effects);
  await tabs.getByRole('link', { name: 'Context & equity', exact: true }).click();
  await expect(page).toHaveURL(learningRoutes.context);
  await tabs.getByRole('link', { name: 'Confidence', exact: true }).click();
  await expect(page).toHaveURL(learningRoutes.confidence);
  await tabs.getByRole('link', { name: 'Scenario lab', exact: true }).click();
  await expect(page).toHaveURL(learningRoutes.scenario);
});

test('effects explorer updates pooled summaries, hides correctly, and links to the expected study source sheet', async ({ page, request }) => {
  const response = await request.get('/data/food-analysis.json');
  expect(response.ok()).toBeTruthy();
  const analysis = await response.json() as FoodAnalysis;
  const all = analysis.syntheses.find((item) => item.id === 'all')!;
  const lowerRisk = analysis.syntheses.find((item) => item.id === 'lower-risk')!;

  await page.goto(learningRoutes.effects);
  await expect(page.getByLabel('Outcome')).toHaveValue('purchase');
  await expect(page.getByLabel('Analysis specification')).toHaveValue('all');
  await expect(page.locator('[data-analysis="all"]')).toBeVisible();
  await expect(page.locator('[data-analysis="all"] tbody tr')).toHaveCount(all.k);
  await expect(page.locator('[data-analysis="all"] [data-pooled-summary] strong')).toHaveText(all.rr.toFixed(2));

  await page.getByLabel('Analysis specification').selectOption('lower-risk');
  await expect(page.locator('[data-analysis="lower-risk"]')).toBeVisible();
  await expect(page.locator('[data-analysis="lower-risk"] tbody tr')).toHaveCount(lowerRisk.k);
  await expect(page.locator('[data-analysis="lower-risk"] [data-pooled-summary] strong')).toHaveText(lowerRisk.rr.toFixed(2));
  await expect(page.locator('[data-analysis="lower-risk"] .analysis-metrics div').nth(1).locator('strong')).toContainText(String(lowerRisk.k));

  await page.locator('#show-pooled').uncheck();
  await expect(page.locator('[data-analysis="lower-risk"] [data-pooled-summary]')).toBeHidden();
  await expect(page.locator('#absolute-panel')).toBeHidden();
  await expect(page.locator('#analysis-status')).toContainText('Individual study estimates only; pooled estimate hidden.');
  await expect(page.locator('[data-analysis="lower-risk"] tbody tr')).toHaveCount(lowerRisk.k);

  await page.getByLabel('Outcome').selectOption('health');
  await expect(page.locator('#unmeasured-outcome')).toBeVisible();
  await expect(page.locator('#quantitative-results')).toBeHidden();
  await expect(page.getByLabel('Analysis specification')).toBeDisabled();
  await expect(page.locator('#show-pooled')).toBeDisabled();
  await expect(page.locator('#analysis-status')).toContainText('No synthetic data for diet quality or health outcomes.');

  await page.getByLabel('Outcome').selectOption('purchase');
  await page.getByLabel('Analysis specification').selectOption('all');
  await page.locator('#show-pooled').check();
  await setRange(page, 'baseline-risk', 50);

  const absolute = absoluteText(50, all.rr, all.ciLow, all.ciHigh);
  await expect(page.locator('#absolute-rate')).toHaveText(absolute.rate);
  await expect(page.locator('#absolute-ci')).toHaveText(absolute.ci);
  await expect(page.locator('#absolute-difference')).toHaveText(absolute.diffText);

  const visibleLinks = page.locator('[data-analysis="all"] tbody tr th[scope="row"] a');
  await expect(visibleLinks).toHaveCount(all.studyIds.length);
  await expect(visibleLinks.first()).toHaveAttribute('href', /\/learning\/food-access\/studies\/fs01-river-east\/$/);

  await visibleLinks.first().click();
  await expect(page).toHaveURL(learningRoutes.study);
  const fs01 = analysis.studies.find((study) => study.id === 'fs01-river-east')!;
  await expect(page.getByText(`${fs01.interventionEvents} purchases / ${fs01.interventionTotal} households`)).toBeVisible();
  await expect(page.getByText(`${fs01.controlEvents} purchases / ${fs01.controlTotal} households`)).toBeVisible();
  await page.getByRole('link', { name: 'Back to the effect explorer' }).click();
  await expect(page).toHaveURL(learningRoutes.effects);
});

test('scenario lab stays in sync with runScenario outputs, handles budgeting edge cases, and exports synthetic JSON', async ({ page }) => {
  const defaults = defaultScenarioSettings();
  const baselineResult = runScenario(defaults);

  await page.goto(learningRoutes.scenario);
  await waitForScenario(page);

  await expect(page.locator('#baseline-access')).toHaveText(String(baselineResult.baseline.accessible));
  await expect(page.locator('#alternative-access')).toHaveText(String(baselineResult.scenario.accessible));
  await expect(page.locator('#access-change')).toHaveText('0');

  await expect(page.locator('#household-select option').first()).toContainText('Household 1');
  await page.locator('#household-select').selectOption({ index: 0 });
  const firstHousehold = baselineResult.households[0];
  await expect(page.locator('#household-detail')).toContainText(`Household ${firstHousehold.id}`);
  await expect(page.locator('#household-detail')).toContainText(`walking speed ${(firstHousehold.speed / 60).toFixed(2)} m/s`);

  await page.locator('#scenario-preset').click();
  await waitForScenario(page);
  const presetSettings = { ...defaults, selectedShopIds: ['shop-a', 'shop-c'], offerPrice: 10, extendHours: true };
  const presetResult = runScenario(presetSettings);
  await expect(page.locator('#baseline-access')).toHaveText(String(presetResult.baseline.accessible));
  await expect(page.locator('#alternative-access')).toHaveText(String(presetResult.scenario.accessible));

  await page.locator('#save-scenario').click();
  await setRange(page, 'offer-price', 11);
  await waitForScenario(page);
  await expect(page.locator('#saved-comparison')).toBeVisible();
  await expect(page.locator('#saved-comparison-text')).toContainText('The same synthetic population seed is used.');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-scenario').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const downloaded = JSON.parse(await readFile(path!, 'utf8')) as {
    synthetic: boolean;
    evidenceRelationship?: string;
    result: { settings: { seed: number; offerPrice: number } };
  };
  expect(downloaded.synthetic).toBe(true);
  expect(downloaded.result.settings.seed).toBe(defaults.seed);
  expect(downloaded.result.settings.offerPrice).toBe(11);
  expect(downloaded.evidenceRelationship).toContain('not a parameter');

  await page.locator('#scenario-reset').click();
  await waitForScenario(page);
  await page.locator('#extend-hours').check();
  await page.locator('input[name="shops"][value="shop-a"]').check();
  await waitForScenario(page);
  await page.locator('input[name="shops"][value="shop-b"]').check();
  await waitForScenario(page);
  await setRange(page, 'scenario-budget', 1000);
  await expect(page.locator('#scenario-error')).toBeVisible();
  await expect(page.locator('#scenario-error')).toContainText('above the £1,000 setup budget');
  await expect(page.locator('#scenario-results')).toBeHidden();

  await page.locator('#scenario-reset').click();
  await waitForScenario(page);
  await expect(page.locator('#scenario-budget')).toHaveValue(String(defaults.budget));
  await expect(page.locator('#offer-price')).toHaveValue(String(defaults.offerPrice));
  await expect(page.locator('#alternative-access')).toHaveText(String(baselineResult.scenario.accessible));

  await page.locator('#scenario-preset').click();
  await waitForScenario(page);
  const oldValue = 24;
  const finalValue = 8;
  await setRange(page, 'offer-price', oldValue);
  await setRange(page, 'offer-price', finalValue);
  await waitForScenario(page);
  const presetForRace = { ...defaults, selectedShopIds: ['shop-a', 'shop-c'], offerPrice: 10, extendHours: true };
  const finalExpected = runScenario({ ...presetForRace, offerPrice: finalValue });
  const oldExpected = runScenario({ ...presetForRace, offerPrice: oldValue });
  await expect(page.locator('#alternative-access')).toHaveText(String(finalExpected.scenario.accessible));
  expect(finalExpected.scenario.accessible).not.toBe(oldExpected.scenario.accessible);

  const animate = page.locator('#animate-route');
  await expect(animate).toHaveAttribute('aria-pressed', 'false');
  await expect(animate).toHaveText('Animate route');
  await expect(page.locator('#route-traveller')).toHaveAttribute('visibility', 'hidden');

  for (let i = 0; i < 10; i += 1) {
    await page.locator('#household-select').selectOption({ index: i });
    if (await animate.isEnabled()) break;
  }
  await expect(animate).toBeEnabled();
  await animate.click();
  await expect(animate).toHaveAttribute('aria-pressed', 'true');
  await expect(animate).toHaveText('Pause route');
  await expect(page.locator('#route-traveller')).toHaveAttribute('visibility', 'visible');
  await animate.click();
  await expect(animate).toHaveAttribute('aria-pressed', 'false');
  await expect(animate).toHaveText('Animate route');
  await expect(page.locator('#route-traveller')).toHaveAttribute('visibility', 'hidden');
});

test('learning routes pass WCAG 2.2 AA automated checks and capture route screenshots', async ({ page }, testInfo) => {
  for (const route of [learningRoutes.overview, learningRoutes.effects, learningRoutes.context, learningRoutes.confidence, learningRoutes.scenario, learningRoutes.study]) {
    await page.goto(route);
    if (route === learningRoutes.scenario) await waitForScenario(page);
    const axe = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect.soft(axe.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })), `${route}: fix the listed WCAG violations.`).toEqual([]);
  }

  for (const [route, slug] of [
    [learningRoutes.overview, 'learning-overview'],
    [learningRoutes.effects, 'learning-effects'],
    [learningRoutes.scenario, 'learning-scenario'],
  ] as const) {
    await page.goto(route);
    if (route === learningRoutes.scenario) await waitForScenario(page);
    const filename = `${slug}-${testInfo.project.name}.png`;
    await page.screenshot({ path: testInfo.outputPath(filename), fullPage: true, animations: 'disabled' });
    await testInfo.attach(filename, { path: testInfo.outputPath(filename), contentType: 'image/png' });
  }
});

test('360px layouts avoid document overflow while charts/tables remain horizontally scrollable within containers', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Narrow viewport overflow regression only runs in mobile project.');
  await page.setViewportSize({ width: 360, height: 800 });

  for (const route of Object.values(learningRoutes)) {
    await page.goto(route);
    if (route === learningRoutes.scenario) await waitForScenario(page);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect.soft(dimensions.doc, `${route} document overflows at 360px.`).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect.soft(dimensions.body, `${route} body overflows at 360px.`).toBeLessThanOrEqual(dimensions.viewport + 1);
  }

  await page.goto(learningRoutes.effects);
  const forestScroll = page.locator('.forest-scroll').first();
  const forestMetrics = await forestScroll.evaluate((node) => ({
    width: node.clientWidth,
    scrollWidth: node.scrollWidth,
    overflowX: getComputedStyle(node).overflowX,
  }));
  expect(forestMetrics.scrollWidth).toBeGreaterThan(forestMetrics.width);
  expect(['auto', 'scroll']).toContain(forestMetrics.overflowX);
  await forestScroll.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  expect(await forestScroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);

  const tableScroll = page.locator('.data-table-scroll').first();
  const tableMetrics = await tableScroll.evaluate((node) => ({
    width: node.clientWidth,
    scrollWidth: node.scrollWidth,
    overflowX: getComputedStyle(node).overflowX,
  }));
  expect(tableMetrics.scrollWidth).toBeGreaterThan(tableMetrics.width);
  expect(['auto', 'scroll']).toContain(tableMetrics.overflowX);

  await page.goto(learningRoutes.scenario);
  await waitForScenario(page);
  const scenarioTableScroll = page.locator('.data-table-scroll').first();
  const scenarioTableMetrics = await scenarioTableScroll.evaluate((node) => ({
    width: node.clientWidth,
    scrollWidth: node.scrollWidth,
    overflowX: getComputedStyle(node).overflowX,
  }));
  expect(scenarioTableMetrics.scrollWidth).toBeGreaterThan(scenarioTableMetrics.width);
  expect(['auto', 'scroll']).toContain(scenarioTableMetrics.overflowX);
});

test('effects and scenario controls remain keyboard-operable through native interactions', async ({ page }) => {
  await page.goto(learningRoutes.effects);
  const outcome = page.getByLabel('Outcome');
  await outcome.focus();
  await page.keyboard.press('ArrowDown');
  await expect(outcome).toHaveValue('health');
  await page.keyboard.press('ArrowUp');
  await expect(outcome).toHaveValue('purchase');

  const pooled = page.locator('#show-pooled');
  await pooled.focus();
  await page.keyboard.press('Space');
  await expect(pooled).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(pooled).toBeChecked();

  const baselineRange = page.locator('#baseline-risk');
  await baselineRange.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#baseline-risk-value')).toHaveText('35');

  await page.goto(learningRoutes.scenario);
  await waitForScenario(page);
  const extendHours = page.locator('#extend-hours');
  await extendHours.focus();
  const before = await extendHours.isChecked();
  await page.keyboard.press('Space');
  await expect(extendHours).toHaveJSProperty('checked', !before);
  await waitForScenario(page);

  const household = page.locator('#household-select');
  await household.focus();
  await expect(household).toBeFocused();
  const householdBefore = await household.inputValue();
  await page.keyboard.press('ArrowDown');
  await expect(household).not.toHaveValue(householdBefore);

  const mapView = page.locator('#map-view');
  await mapView.focus();
  await page.keyboard.press('ArrowDown');
  await expect(mapView).toHaveValue('baseline');
});

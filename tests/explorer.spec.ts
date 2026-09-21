import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const recordId = 'cooler-walking-routes';
const mainRoutes = ['/', '/evidence/', '/map/', `/evidence/${recordId}/`, '/about/'];
const visibleCards = (page: Page) => page.locator('#record-list [data-record-id]:visible');
const visibleIds = (page: Page) => visibleCards(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('data-record-id')));

async function openExplorer(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('searchbox', { name: 'Search the evidence' })).toBeEnabled();
}

async function expectCount(page: Page, count: number) {
  await expect(page.locator('#result-count strong')).toHaveText(String(count));
  await expect(visibleCards(page)).toHaveCount(count);
}

async function expectVisibleFocus(locator: Locator, ring = locator) {
  await expect(locator).toBeFocused();
  const style = await ring.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { style: computed.outlineStyle, width: parseFloat(computed.outlineWidth), color: computed.outlineColor };
  });
  expect(style.style, 'Keyboard focus must have a visible outline.').not.toBe('none');
  expect(style.width, 'Keyboard focus outline must be at least 2px.').toBeGreaterThanOrEqual(2);
  expect(style.color).not.toBe('rgba(0, 0, 0, 0)');
}

test('library combines filters, searches, removes chips, clears empty results and sorts', async ({ page, request }) => {
  await openExplorer(page, '/evidence/');
  await expectCount(page, 18);
  await page.getByLabel('Learning theme', { exact: true }).selectOption('children-families');
  await page.getByLabel('Knowledge type', { exact: true }).selectOption('research');
  await page.getByLabel('Population', { exact: true }).selectOption('families-carers');
  await page.getByLabel('Place', { exact: true }).selectOption('northvale');
  await page.getByRole('searchbox').fill('CROSSINGS');
  await expectCount(page, 1);
  await expect.poll(() => visibleIds(page)).toEqual(['school-journey-crossings']);
  await expect(page.locator('#active-filters button')).toHaveCount(5);
  await page.getByRole('searchbox').fill('no-such-record-987654');
  await expectCount(page, 0);
  await expect(page.getByRole('heading', { name: 'No records match this combination' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expectCount(page, 18);
  await expect(page.locator('#active-filters button')).toHaveCount(0);
  await expect(page).toHaveURL('/evidence/');
  for (const label of ['Learning theme', 'Knowledge type', 'Population', 'Place']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
  }
  const response = await request.get('/data/evidence.json');
  expect(response.ok()).toBeTruthy();
  const records: { id: string; title: string; year: number }[] = await response.json();
  for (const sort of ['oldest', 'title', 'newest']) {
    await page.getByLabel('Sort by', { exact: true }).selectOption(sort);
    const ordered = [...records].sort((a, b) => {
      const year = sort === 'oldest' ? a.year - b.year : sort === 'newest' ? b.year - a.year : 0;
      const left = a.title.toLowerCase();
      const right = b.title.toLowerCase();
      return year || (left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    await expect.poll(() => visibleIds(page), { message: `Rendered cards must follow ${sort} ordering.` }).toEqual(ordered.map((record) => record.id));
  }
  await page.getByLabel('Sort by', { exact: true }).selectOption('oldest');
  await page.getByRole('button', { name: 'Reset all filters' }).click();
  await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('newest');
  await page.getByRole('searchbox').fill('CROSSINGS');
  await expectCount(page, 1);
  await expect(page.locator('#active-filters button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove Search: CROSSINGS filter', exact: true }).click();
  await expect(page.getByRole('searchbox'), 'One click on the search chip must clear the query, even while the search input is focused.').toHaveValue('');
  await expect(page.locator('#active-filters button')).toHaveCount(0);
  await expectCount(page, 18);
});

test('URL hydration, reload, view switching and detail return retain the chosen filters', async ({ page }) => {
  const query = 'q=CROSSINGS&theme=children-families&type=research&population=families-carers&place=northvale&sort=oldest';
  await openExplorer(page, `/evidence/?${query}`);
  for (const [name, value] of new URLSearchParams(query)) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue(value);
  }
  await expectCount(page, 1);
  await page.reload();
  await expectCount(page, 1);
  await visibleCards(page).getByRole('link').click();
  await expect(page).toHaveURL(/\/evidence\/school-journey-crossings\/\?from=/);
  await page.getByRole('link', { name: 'Back to your results' }).click();
  await expect(page).toHaveURL(`/evidence/?${query}`);
  await expectCount(page, 1);
  await page.locator('[data-view="map"]').click();
  await expect(page).toHaveURL(`/map/?${query}`);
  await expect(page.locator('#result-count strong')).toHaveText('1');
  await page.locator('[data-view="library"]').click();
  await expect(page).toHaveURL(`/evidence/?${query}`);
  await expectCount(page, 1);
});

test('all 16 map cells agree with unique library results, including a filtered map', async ({ page }) => {
  test.setTimeout(90_000);
  for (const query of ['', '?place=northvale&population=all-residents']) {
    await openExplorer(page, `/map/${query}`);
    await expect(page.locator('[data-cell]')).toHaveCount(16);
    const total = Number(await page.locator('#result-count strong').textContent());
    const cells = await page.locator('[data-cell]').evaluateAll((nodes) => nodes.map((node) => {
      const link = node.querySelector<HTMLAnchorElement>('[data-cell-link]')!;
      return { theme: node.getAttribute('data-theme'), type: node.getAttribute('data-type'), count: Number(link.querySelector('strong')!.textContent), href: link.getAttribute('href')!, hidden: link.hidden, emptyHidden: (node.querySelector('[data-cell-empty]') as HTMLElement).hidden };
    }));
    const union = new Set<string | null>();
    for (const cell of cells) {
      await test.step(`${query || 'all records'}: ${cell.theme} / ${cell.type}`, async () => {
        expect(cell.hidden, 'Zero cells must not offer a record link.').toBe(cell.count === 0);
        expect(cell.emptyHidden).toBe(cell.count > 0);
        if (!cell.count) return;
        await openExplorer(page, cell.href);
        await expectCount(page, cell.count);
        const ids = await visibleIds(page);
        expect(new Set(ids).size, 'Cell links must show unique records, not duplicated theme memberships.').toBe(cell.count);
        ids.forEach((id) => union.add(id));
        await expect(page.getByLabel('Learning theme', { exact: true })).toHaveValue(cell.theme!);
        await expect(page.getByLabel('Knowledge type', { exact: true })).toHaveValue(cell.type!);
        if (query) {
          await expect(page.getByLabel('Place', { exact: true })).toHaveValue('northvale');
          await expect(page.getByLabel('Population', { exact: true })).toHaveValue('all-residents');
        }
      });
    }
    expect(union.size, 'Map total must equal the union of cell records, not the sum of cell counts.').toBe(total);
  }
});

test('HTML-looking search terms stay literal text after typing and URL hydration', async ({ page }) => {
  const payload = '<img src=x onerror="window.__searchXss=1"><svg onload="window.__searchXss=1">';
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await openExplorer(page, '/evidence/');
  await page.getByRole('searchbox').fill(payload);
  await expect(page.locator('#active-filters')).toHaveText(`Search: ${payload} ×`);
  await expectCount(page, 0);
  for (const route of ['/evidence/', '/map/']) {
    await openExplorer(page, `${route}?${new URLSearchParams({ q: payload })}`);
    await expect(page.getByRole('searchbox')).toHaveValue(payload);
    await expect(page.locator('#active-filters')).toHaveText(`Search: ${payload} ×`);
    await expect(page.locator('#active-filters img, #active-filters svg, #active-filters script')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, '__searchXss')), 'Search markup must never execute.').toBeUndefined();
  }
  expect(dialogs).toEqual([]);
});

test('direct record/source navigation works and hostile return URLs stay on site', async ({ page }) => {
  await page.goto(`/evidence/${recordId}/`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('cooler walking routes');
  await expect(page.getByText('This is a fictional demonstration record.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View example source' }).click();
  await expect(page).toHaveURL(`/sources/${recordId}/`);
  await expect(page.getByText('Demonstration material, not an original study.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('cooler walking routes');
  await page.getByRole('link', { name: 'Back to the evidence record' }).click();
  await expect(page).toHaveURL(`/evidence/${recordId}/`);
  for (const from of ['https://example.org/evidence/?q=escape', '//example.org/map/', 'javascript:alert(1)', '/sources/not-a-return-route/', 'http://[invalid']) {
    await page.goto(`/evidence/${recordId}/?${new URLSearchParams({ from })}`);
    await expect(page.locator('[data-back]'), `Unsafe return target ${from} must fall back to the library.`).toHaveAttribute('href', '/evidence/');
    await page.locator('[data-back]').click();
    await expect(page).toHaveURL('/evidence/');
  }
  await page.goto(`/evidence/${recordId}/?${new URLSearchParams({ from: '/map/?place=northvale' })}`);
  await page.getByRole('link', { name: 'Back to your evidence map' }).click();
  await expect(page).toHaveURL('/map/?place=northvale');
});

test('keyboard users can skip navigation, operate filters and see focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expectVisibleFocus(skip);
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await openExplorer(page, '/evidence/');
  const search = page.getByRole('searchbox');
  // Traverse the real tab order rather than assigning focus with script.
  for (let tabs = 0; tabs < 20; tabs++) {
    await page.keyboard.press('Tab');
    if (await search.evaluate((element) => element === document.activeElement)) break;
  }
  await expectVisibleFocus(search, page.locator('.search-field'));
  await page.keyboard.type('crossings');
  await expectCount(page, 1);
  await page.keyboard.press('Tab');
  const theme = page.getByLabel('Learning theme', { exact: true });
  await expectVisibleFocus(theme);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(theme).toHaveValue('healthy-places');
  await expectVisibleFocus(page.getByLabel('Knowledge type', { exact: true }));
  await openExplorer(page, '/map/');
  const scroll = page.getByRole('region', { name: 'Evidence map table. Scroll horizontally on small screens.' });
  await scroll.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expectVisibleFocus(scroll);
});

test('main routes pass automated WCAG 2.2 AA checks and capture homepage/map previews', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  for (const route of mainRoutes) {
    await page.goto(route);
    if (route === '/evidence/' || route === '/map/') await expect(page.getByRole('searchbox')).toBeEnabled();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect.soft(result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, url: violation.helpUrl, nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })), `${route}: fix the listed WCAG violations in the interface.`).toEqual([]);
    if (route === '/' || route === '/map/') {
      const filename = `${route === '/' ? 'home' : 'map'}-${testInfo.project.name}.png`;
      await page.screenshot({ path: testInfo.outputPath(filename), fullPage: route === '/map/', animations: 'disabled' });
      await testInfo.attach(filename, { path: testInfo.outputPath(filename), contentType: 'image/png' });
    }
  }
});

test('360px layouts have no page-level horizontal overflow; the map scrolls internally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Narrow-screen regression runs once in the mobile project.');
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of [...mainRoutes, `/sources/${recordId}/`]) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect.soft(dimensions.document, `${route}: document overflows at 360px.`).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect.soft(dimensions.body, `${route}: body overflows at 360px.`).toBeLessThanOrEqual(dimensions.viewport + 1);
    if (route === '/map/') {
      const region = page.locator('.map-scroll');
      const dimensions = await region.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, overflow: getComputedStyle(element).overflowX }));
      expect.soft(dimensions.scrollWidth).toBeGreaterThan(dimensions.width);
      expect.soft(['auto', 'scroll']).toContain(dimensions.overflow);
      await region.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      expect.soft(await region.evaluate((element) => element.scrollLeft), 'The clipped map columns must remain reachable inside the map.').toBeGreaterThan(0);
    }
  }
});

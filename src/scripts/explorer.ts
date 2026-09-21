import { defaultFilters, filterRecords, filtersFromParams, paramsFromFilters, mapCount, labelFor, THEMES, TYPES, PLACES, POPULATIONS, type PublicEvidence, type Filters } from '../lib/catalogue';

const root = document.querySelector<HTMLElement>('[data-explorer]');
if (root) {
  const records: PublicEvidence[] = JSON.parse(document.querySelector('#evidence-data')!.textContent!);
  const form = document.querySelector<HTMLFormElement>('#filter-form')!;
  const count = document.querySelector<HTMLElement>('#result-count')!;
  const active = document.querySelector<HTMLElement>('#active-filters')!;
  const empty = document.querySelector<HTMLElement>('#empty-results')!;
  const cards = new Map(Array.from(document.querySelectorAll<HTMLElement>('[data-record-id]')).map(card => [card.dataset.recordId!, card]));
  const list = document.querySelector('#record-list');
  let current = filtersFromParams(new URLSearchParams(location.search));
  let timer: ReturnType<typeof setTimeout>;

  function syncControls() {
    for (const key of Object.keys(defaultFilters()) as (keyof Filters)[]) {
      const control = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
      if (control) control.value = current[key];
    }
  }
  function catalogueUrl(path: string, filters: Filters): string {
    const query = paramsFromFilters(filters).toString();
    return path + (query ? `?${query}` : '');
  }
  function render(updateUrl = true) {
    const matches = filterRecords(records, current);
    if (updateUrl) history.replaceState(null, '', catalogueUrl(location.pathname, current));
    count.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = String(matches.length);
    count.append(strong, ` example ${matches.length === 1 ? 'record' : 'records'}`);
    empty.hidden = matches.length !== 0;
    const ids = new Set(matches.map(record => record.id));
    for (const [id, card] of cards) card.hidden = !ids.has(id);
    for (const match of matches) { const card = cards.get(match.id); if (card && list) list.append(card); }
    const returnTo = location.pathname + location.search;
    for (const [id, card] of cards) {
      const link = card.querySelector<HTMLAnchorElement>('[data-record-link]')!;
      link.href = `/evidence/${id}/?from=${encodeURIComponent(returnTo)}`;
    }
    root!.querySelectorAll<HTMLAnchorElement>('[data-view]').forEach(link => {
      link.href = catalogueUrl(link.dataset.view === 'map' ? '/map/' : '/evidence/', current);
    });
    root!.querySelectorAll<HTMLElement>('[data-cell]').forEach(cell => {
      const theme = cell.dataset.theme!;
      const type = cell.dataset.type!;
      const n = mapCount(matches, theme, type);
      const link = cell.querySelector<HTMLAnchorElement>('[data-cell-link]')!;
      cell.className = `density-${Math.min(n, 4)}`;
      link.hidden = !n;
      cell.querySelector<HTMLElement>('[data-cell-empty]')!.hidden = !!n;
      link.querySelector('strong')!.textContent = String(n);
      link.querySelector('span')!.textContent = `${n === 1 ? 'record' : 'records'} ↗`;
      link.setAttribute('aria-label', `${n} ${n === 1 ? 'record' : 'records'}: ${labelFor(THEMES, theme)}, ${labelFor(TYPES, type)}`);
      link.href = catalogueUrl('/evidence/', { ...current, theme, type });
    });
    active.replaceChildren();
    const labels: Record<string, string> = {
      q: `Search: ${current.q}`, theme: labelFor(THEMES, current.theme), type: labelFor(TYPES, current.type),
      population: labelFor(POPULATIONS, current.population), place: labelFor(PLACES, current.place),
    };
    for (const key of ['q', 'theme', 'type', 'population', 'place'] as const) {
      if (!current[key]) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'filter-chip';
      button.textContent = `${labels[key]} ×`;
      button.setAttribute('aria-label', `Remove ${labels[key]} filter`);
      button.addEventListener('click', () => {
        clearTimeout(timer); current[key] = ''; syncControls(); render();
        (form.elements.namedItem(key) as HTMLElement)?.focus();
      });
      active.append(button);
    }
  }
  function readControls() {
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => params.set(key, String(value)));
    current = filtersFromParams(params); render();
  }
  form.querySelector<HTMLFieldSetElement>('[data-js-controls]')!.disabled = false;
  const sort = document.querySelector<HTMLSelectElement>('[data-sort]');
  if (sort) { sort.disabled = false; sort.addEventListener('change', readControls); }
  form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); readControls(); });
  form.addEventListener('input', event => {
    if ((event.target as HTMLInputElement).name !== 'q') return;
    clearTimeout(timer); timer = setTimeout(readControls, 120);
  });
  form.addEventListener('change', event => {
    // Search already updates on input. Its blur/change must not replace a chip
    // between pointer-down and click when someone removes that search filter.
    if ((event.target as HTMLInputElement).name === 'q') return;
    clearTimeout(timer); readControls();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-reset]').forEach(button => button.addEventListener('click', () => {
    clearTimeout(timer); current = defaultFilters(); syncControls(); render();
    document.querySelector<HTMLInputElement>('#search')!.focus();
  }));
  addEventListener('popstate', () => { clearTimeout(timer); current = filtersFromParams(new URLSearchParams(location.search)); syncControls(); render(false); });
  syncControls(); render();
}

/** Browser-safe domain definitions. This module must never import the register. */
export interface EvidenceRecord {
  id: string;
  title: string;
  year: number;
  summary: string;
  themes: string[];
  populations: string[];
  places: string[];
  evidenceType: string;
  strength: string;
  strengthReason: string;
  methods: string;
  sampleContext: string;
  findings: string[];
  limitations: string[];
  useNotes: string[];
  producer: string;
  funder: string;
  programme: string;
  releaseApproved: boolean;
}

export type PublicEvidence = Omit<EvidenceRecord, 'releaseApproved'>;
export interface TaxonomyOption { id: string; title: string }
export interface ThemeOption extends TaxonomyOption { description: string }

export const THEMES: ThemeOption[] = [
  { id: 'healthy-places', title: 'Healthy places', description: 'Illustrative evidence about housing, streets and shared neighbourhood spaces.' },
  { id: 'children-families', title: 'Children and families', description: 'Illustrative evidence about growing up, care and family wellbeing.' },
  { id: 'work-income', title: 'Work and income', description: 'Illustrative evidence about livelihoods, working conditions and financial security.' },
  { id: 'air-environment', title: 'Air and environment', description: 'Illustrative evidence about air quality, heat and environmental exposures.' },
];
export const TYPES: TaxonomyOption[] = [
  { id: 'research', title: 'Research' },
  { id: 'evaluation', title: 'Evaluation' },
  { id: 'community', title: 'Community insight' },
  { id: 'practice', title: 'Practice learning' },
];
export const POPULATIONS: TaxonomyOption[] = [
  { id: 'all-residents', title: 'All residents' },
  { id: 'children-young-people', title: 'Children and young people' },
  { id: 'families-carers', title: 'Families and carers' },
  { id: 'older-people', title: 'Older people' },
  { id: 'workers', title: 'Workers' },
];
export const PLACES: TaxonomyOption[] = [
  { id: 'northvale', title: 'Northvale' },
  { id: 'eastmere', title: 'Eastmere' },
  { id: 'wider-context', title: 'Wider context' },
];
/** Supplied illustrative reviewer judgements, not a hierarchy of evidence types. */
export const STRENGTHS: TaxonomyOption[] = [
  { id: 'consistent', title: 'More consistent' },
  { id: 'mixed', title: 'Mixed' },
  { id: 'limited', title: 'Limited' },
];

export interface Filters {
  q: string;
  theme: string;
  type: string;
  population: string;
  place: string;
  sort: string;
}

export function defaultFilters(): Filters {
  return { q: '', theme: '', type: '', population: '', place: '', sort: 'newest' };
}

function vocabularyValue(value: string | null, options: TaxonomyOption[]): string {
  return options.some((option) => option.id === value) ? value! : '';
}

/** Unknown keys are ignored; unknown vocabulary values become the default. */
export function filtersFromParams(params: URLSearchParams): Filters {
  const sort = params.get('sort');
  return {
    q: (params.get('q') ?? '').trim(),
    theme: vocabularyValue(params.get('theme'), THEMES),
    type: vocabularyValue(params.get('type'), TYPES),
    population: vocabularyValue(params.get('population'), POPULATIONS),
    place: vocabularyValue(params.get('place'), PLACES),
    sort: sort && ['newest', 'oldest', 'title'].includes(sort) ? sort : 'newest',
  };
}

export function paramsFromFilters(filters: Filters): URLSearchParams {
  const input = new URLSearchParams();
  for (const key of Object.keys(defaultFilters()) as (keyof Filters)[]) {
    input.set(key, filters[key]);
  }
  const clean = filtersFromParams(input);
  const defaults = defaultFilters();
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults) as (keyof Filters)[]) {
    if (clean[key] !== defaults[key]) params.set(key, clean[key]);
  }
  return params;
}

// Code-point comparison avoids host-locale differences between build and browser.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function filterRecords(records: PublicEvidence[], filters: Filters): PublicEvidence[] {
  const q = filters.q.trim().toLowerCase();
  const matches = records.filter((record) =>
    (!q || [record.title, record.summary, record.programme].some((text) => text.toLowerCase().includes(q))) &&
    (!filters.theme || record.themes.includes(filters.theme)) &&
    (!filters.type || record.evidenceType === filters.type) &&
    (!filters.population || record.populations.includes(filters.population)) &&
    (!filters.place || record.places.includes(filters.place)),
  );
  return matches.sort((a, b) => {
    const titleOrder = compareText(a.title.toLowerCase(), b.title.toLowerCase());
    const tieBreak = titleOrder || compareText(a.id, b.id);
    if (filters.sort === 'title') return tieBreak;
    return (filters.sort === 'oldest' ? a.year - b.year : b.year - a.year) || tieBreak;
  });
}

/** Counts unique records in one cell; multi-theme cells must not be summed as a total. */
export function mapCount(records: PublicEvidence[], theme: string, type: string): number {
  return new Set(records.filter((record) => record.themes.includes(theme) && record.evidenceType === type)
    .map((record) => record.id)).size;
}

export function labelFor(options: { id: string; title: string }[], id: string): string {
  return options.find((option) => option.id === id)?.title ?? id;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import rawRegister from '../src/data/records.json';
import {
  THEMES, TYPES, POPULATIONS, PLACES, STRENGTHS,
  defaultFilters, filtersFromParams, paramsFromFilters, filterRecords, mapCount, labelFor,
} from '../src/lib/catalogue';
import { assertValidRegister, publicRecords, safeJson } from '../src/lib/evidence';

test('register has 18 unique public records and exactly one unreleased fixture', () => {
  const validated = assertValidRegister(rawRegister);
  assert.equal(validated.length, 19);
  assert.equal(publicRecords.length, 18);
  assert.equal(new Set(publicRecords.map((record) => record.id)).size, 18);
  assert.deepEqual(validated.filter((record) => !record.releaseApproved).map((record) => record.id), ['unreleased-test-fixture']);
  assert.ok(publicRecords.every((record) => !Object.hasOwn(record, 'releaseApproved')));
  assert.ok(!publicRecords.some((record) => record.id === 'unreleased-test-fixture'));
  const payload = safeJson(publicRecords);
  assert.ok(!payload.includes('UNRELEASED_FIXTURE_SENTINEL'));
  assert.ok(!payload.includes('unreleased-test-fixture'));
  assert.ok(!payload.includes('releaseApproved'));
  assert.equal(rawRegister[0].releaseApproved, true, 'projection must not mutate source data');
});

test('all demo narrative and source fields are explicitly illustrative', () => {
  for (const record of assertValidRegister(rawRegister)) {
    for (const text of [record.title, record.summary, record.strengthReason, record.methods,
      record.sampleContext, record.programme, ...record.findings, ...record.limitations, ...record.useNotes]) {
      assert.match(text, /fictional|illustrative/i, `${record.id}: ${text}`);
    }
    assert.match(record.producer, /^Example /);
    assert.match(record.funder, /^Example /);
  }
});

test('closed taxonomies have the expected IDs and strength labels', () => {
  assert.deepEqual(THEMES.map((item) => item.id), ['healthy-places', 'children-families', 'work-income', 'air-environment']);
  assert.deepEqual(TYPES.map((item) => item.id), ['research', 'evaluation', 'community', 'practice']);
  assert.deepEqual(POPULATIONS.map((item) => item.id), ['all-residents', 'children-young-people', 'families-carers', 'older-people', 'workers']);
  assert.deepEqual(PLACES.map((item) => item.id), ['northvale', 'eastmere', 'wider-context']);
  assert.deepEqual(STRENGTHS.map((item) => [item.id, item.title]), [['consistent', 'More consistent'], ['mixed', 'Mixed'], ['limited', 'Limited']]);
  assert.equal(labelFor(THEMES, 'healthy-places'), 'Healthy places');
  assert.equal(labelFor(THEMES, 'unknown'), 'unknown');
});

test('URL filters sanitize unknown keys and values and omit defaults', () => {
  assert.deepEqual(filtersFromParams(new URLSearchParams()), defaultFilters());
  const invalid = new URLSearchParams('theme=unknown&type=report&population=everyone&place=both&sort=strongest&releaseApproved=false&extra=1');
  assert.deepEqual(filtersFromParams(invalid), defaultFilters());
  assert.equal(paramsFromFilters(defaultFilters()).toString(), '');
  const filters = filtersFromParams(new URLSearchParams('q=%20%20SCHOOL%20%20&theme=children-families&type=research&population=families-carers&place=northvale&sort=oldest&extra=1'));
  assert.equal(filters.q, 'SCHOOL');
  assert.equal(paramsFromFilters(filters).toString(), 'q=SCHOOL&theme=children-families&type=research&population=families-carers&place=northvale&sort=oldest');
  assert.deepEqual(filtersFromParams(paramsFromFilters(filters)), filters);
  assert.equal(paramsFromFilters({ ...defaultFilters(), theme: 'unknown', q: '   ', sort: 'bad' }).toString(), '');
  for (const sort of ['newest', 'oldest', 'title']) {
    assert.equal(filtersFromParams(new URLSearchParams({ sort })).sort, sort);
  }
  const first = defaultFilters();
  first.theme = 'healthy-places';
  assert.equal(defaultFilters().theme, '', 'defaults must be independently mutable');
});

test('combined filters apply AND across all dimensions and support multi-place records', () => {
  const filters = { ...defaultFilters(), q: '  CROSSINGS  ', theme: 'children-families', type: 'research', population: 'families-carers', place: 'northvale' };
  assert.deepEqual(filterRecords(publicRecords, filters).map((record) => record.id), ['school-journey-crossings']);
  assert.deepEqual(filterRecords(publicRecords, { ...filters, place: 'eastmere' }).map((record) => record.id), ['school-journey-crossings']);
  assert.equal(filterRecords(publicRecords, { ...filters, population: 'older-people' }).length, 0);
  assert.equal(filterRecords(publicRecords, { ...filters, type: 'community' }).length, 0);
  assert.equal(filterRecords(publicRecords, { ...filters, theme: 'work-income' }).length, 0);
  assert.equal(filterRecords(publicRecords, { ...filters, place: 'wider-context' }).length, 0);
});

test('query is trimmed and case-insensitive across title, summary and programme only', () => {
  const record = publicRecords.find((item) => item.id === 'cooler-walking-routes')!;
  for (const q of ['  COOLER WALKING ROUTES ', ' SHORT SUMMER JOURNEYS ', ' EVERYDAY ROUTES ']) {
    assert.deepEqual(filterRecords([record], { ...defaultFilters(), q }), [record]);
  }
  assert.equal(filterRecords([record], { ...defaultFilters(), q: 'Example research team' }).length, 0);
  assert.equal(filterRecords(publicRecords, { ...defaultFilters(), q: ' \t ' }).length, 18);
  assert.equal(filterRecords(publicRecords, { ...defaultFilters(), q: 'UNRELEASED_FIXTURE_SENTINEL' }).length, 0);
});

test('sort is deterministic, ties use title then ID, and the input array is not mutated', () => {
  const base = publicRecords[0];
  const records = [
    { ...base, id: 'z-record', title: 'Bravo', year: 2024 },
    { ...base, id: 'b-record', title: 'alpha', year: 2024 },
    { ...base, id: 'old-record', title: 'Zulu', year: 2020 },
    { ...base, id: 'a-record', title: 'Alpha', year: 2024 },
    { ...base, id: 'new-record', title: 'Charlie', year: 2025 },
  ];
  const before = structuredClone(records);
  const expected = {
    newest: ['new-record', 'a-record', 'b-record', 'z-record', 'old-record'],
    oldest: ['old-record', 'a-record', 'b-record', 'z-record', 'new-record'],
    title: ['a-record', 'b-record', 'z-record', 'new-record', 'old-record'],
  };
  for (const sort of ['newest', 'oldest', 'title'] as const) {
    assert.deepEqual(filterRecords(records, { ...defaultFilters(), sort }).map((record) => record.id), expected[sort]);
    assert.deepEqual(filterRecords([...records].reverse(), { ...defaultFilters(), sort }).map((record) => record.id), expected[sort]);
  }
  assert.deepEqual(records, before);
});

test('matrix counts are unique within cells; cross-theme memberships are not catalogue totals', () => {
  const matrixTotal = THEMES.reduce((total, theme) => total + TYPES.reduce((sum, type) => sum + mapCount(publicRecords, theme.id, type.id), 0), 0);
  const memberships = publicRecords.reduce((total, record) => total + record.themes.length, 0);
  assert.equal(matrixTotal, memberships);
  assert.ok(matrixTotal > publicRecords.length);
  assert.equal(filterRecords(publicRecords, defaultFilters()).length, 18);
  const crossTheme = publicRecords.find((record) => record.id === 'school-journey-crossings')!;
  assert.equal(mapCount([crossTheme, crossTheme], 'healthy-places', 'research'), 1);
  assert.equal(mapCount([crossTheme], 'children-families', 'research'), 1);
  assert.equal(mapCount(publicRecords, 'healthy-places', 'practice'), 0);
  assert.equal(mapCount(publicRecords, 'work-income', 'practice'), 0);
  assert.equal(mapCount(publicRecords, 'air-environment', 'community'), 0);
  assert.equal(mapCount(publicRecords, 'unknown', 'research'), 0);
  const subset = filterRecords(publicRecords, { ...defaultFilters(), place: 'wider-context' });
  assert.equal(mapCount(subset, 'air-environment', 'research'), 1);
});

test('validation rejects unknown vocabularies, including an invalid unpublished record', () => {
  for (const [field, value] of Object.entries({
    themes: ['unknown'], populations: ['everyone'], places: ['both'], evidenceType: 'report', strength: 'high',
  })) {
    const register = structuredClone(rawRegister);
    Object.assign(register[register.length - 1], { [field]: value });
    assert.throws(() => assertValidRegister(register), /Expected one of/);
  }
});

test('validation rejects duplicate IDs and duplicate values in every array field', () => {
  assert.throws(() => assertValidRegister([...rawRegister, rawRegister[0]]), /Duplicate record ID/);
  for (const field of ['themes', 'populations', 'places', 'findings', 'limitations', 'useNotes'] as const) {
    const record = structuredClone(rawRegister[0]);
    record[field].push(record[field][0]);
    assert.throws(() => assertValidRegister([record]), /Duplicate array value/);
  }
});

test('validation requires complete nonempty fields, safe IDs, sensible years and explicit release approval', () => {
  const record = rawRegister[0];
  for (const field of Object.keys(record)) {
    const incomplete: Record<string, unknown> = { ...record };
    delete incomplete[field];
    assert.throws(() => assertValidRegister([incomplete]), `missing ${field}`);
  }
  for (const field of ['title', 'summary', 'strengthReason', 'methods', 'sampleContext', 'producer', 'funder', 'programme']) {
    assert.throws(() => assertValidRegister([{ ...record, [field]: ' \t ' }]));
  }
  for (const field of ['themes', 'populations', 'places', 'findings', 'limitations', 'useNotes']) {
    assert.throws(() => assertValidRegister([{ ...record, [field]: [] }]));
    assert.throws(() => assertValidRegister([{ ...record, [field]: [' '] }]));
  }
  for (const id of ['../private', 'Upper-Case', 'double--dash', '-leading', 'trailing-', 'under_score', '<script>']) {
    assert.throws(() => assertValidRegister([{ ...record, id }]), /safe kebab-case/);
  }
  for (const year of [1899, new Date().getUTCFullYear() + 2, 2024.5, '2024']) {
    assert.throws(() => assertValidRegister([{ ...record, year }]));
  }
  assert.throws(() => assertValidRegister([{ ...record, releaseApproved: 'true' }]));
  assert.throws(() => assertValidRegister([{ ...record, internalNote: 'unexpected field' }]));
  assert.throws(() => assertValidRegister([]));
  assert.throws(() => assertValidRegister(null));
});

test('safeJson escapes script-sensitive characters while preserving JSON values', () => {
  const data = { text: '</script><script>alert("x")</script>&\u2028\u2029', nested: ['plain', null, 42] };
  const serialized = safeJson(data);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/);
  for (const escape of ['\\u003c', '\\u003e', '\\u0026', '\\u2028', '\\u2029']) assert.ok(serialized.includes(escape));
  assert.deepEqual(JSON.parse(serialized), data);
  assert.equal(safeJson(null), 'null');
  assert.throws(() => safeJson(undefined), TypeError);
});

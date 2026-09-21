/**
 * BUILD ONLY: import from Astro frontmatter/server build code, never browser scripts.
 * Only publicRecords may be used to generate routes or serialized client data.
 * Keep records.json out of public/ and out of client dependency graphs.
 */
import { z } from 'zod';
import rawRegister from '../data/records.json';
import { THEMES, TYPES, POPULATIONS, PLACES, STRENGTHS, type EvidenceRecord, type PublicEvidence } from './catalogue';

// Fail closed if accidentally evaluated as a browser module. Import boundaries still
// matter: a runtime guard alone cannot keep a bundled JSON import out of assets.
if (typeof window !== 'undefined') {
  throw new Error('evidence.ts is build-only; import catalogue.ts in browser code.');
}

const nonempty = z.string().trim().min(1, 'Must not be empty');
const vocabulary = (options: { id: string }[]) => nonempty.refine(
  (value) => options.some((option) => option.id === value),
  { message: `Expected one of: ${options.map((option) => option.id).join(', ')}` },
);
const uniqueArray = (item: z.ZodType<string>) => z.array(item).min(1).superRefine((values, context) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: 'Duplicate array value' });
    seen.add(value);
  });
});

const recordSchema = z.object({
  id: nonempty.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected a safe kebab-case ID'),
  title: nonempty,
  year: z.number().int().min(1900).max(new Date().getUTCFullYear() + 1),
  summary: nonempty,
  themes: uniqueArray(vocabulary(THEMES)),
  populations: uniqueArray(vocabulary(POPULATIONS)),
  places: uniqueArray(vocabulary(PLACES)),
  evidenceType: vocabulary(TYPES),
  strength: vocabulary(STRENGTHS),
  strengthReason: nonempty,
  methods: nonempty,
  sampleContext: nonempty,
  findings: uniqueArray(nonempty),
  limitations: uniqueArray(nonempty),
  useNotes: uniqueArray(nonempty),
  producer: nonempty,
  funder: nonempty,
  programme: nonempty,
  releaseApproved: z.boolean(),
}).strict();

const registerSchema = z.array(recordSchema).min(1).superRefine((records, context) => {
  const seen = new Set<string>();
  records.forEach((record, index) => {
    if (seen.has(record.id)) context.addIssue({
      code: z.ZodIssueCode.custom, path: [index, 'id'], message: `Duplicate record ID: ${record.id}`,
    });
    seen.add(record.id);
  });
});

/** Validates every entry, including unreleased entries; throws ZodError on failure. */
export function assertValidRegister(data: unknown): EvidenceRecord[] {
  return registerSchema.parse(data);
}

export const publicRecords: PublicEvidence[] = assertValidRegister(rawRegister)
  .filter((record) => record.releaseApproved)
  .map(({ releaseApproved: _releaseApproved, ...record }) => record);

/** Serialize JSON for a script body; not an HTML-attribute escaping function. */
export function safeJson(data: unknown): string {
  const json = JSON.stringify(data);
  if (json === undefined) throw new TypeError('Value cannot be represented as JSON');
  const escapes: Record<string, string> = {
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
  };
  return json.replace(/[<>&\u2028\u2029]/g, (character) => escapes[character]);
}

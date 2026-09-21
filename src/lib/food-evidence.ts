/**
 * BUILD ONLY: contains synthetic food-access analysis inputs/outputs for route generation.
 * Do not import this module in browser scripts.
 */
import { z } from 'zod';
import rawStudiesJson from '../data/food-studies.json';
import foodAnalysisJson from '../data/food-analysis.json';
import type { FoodAnalysis, FoodStudy, FoodSynthesis } from './learning-types';

const Z_95 = 1.95996398454;
const EPSILON = 1e-12;

if (typeof window !== 'undefined') {
  throw new Error('food-evidence.ts is build-only; do not import from browser code.');
}

const nonEmpty = z.string().trim().min(1);
const kebabFsId = z.string().regex(/^fs\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected fs##-prefixed safe kebab-case ID');
const riskSchema = z.enum(['low', 'some-concerns', 'high']);

const rawStudyBaseSchema = z.object({
  id: kebabFsId,
  name: nonEmpty,
  year: z.number().int().min(2000).max(2100),
  setting: nonEmpty,
  population: nonEmpty,
  intervention: nonEmpty,
  comparator: nonEmpty,
  followUp: nonEmpty,
  design: nonEmpty,
  riskOfBias: riskSchema,
  biasReason: nonEmpty,
  interventionEvents: z.number().int().positive(),
  interventionTotal: z.number().int().min(100).max(300),
  controlEvents: z.number().int().positive(),
  controlTotal: z.number().int().min(100).max(300),
}).strict();

const rawStudySchema = rawStudyBaseSchema.superRefine((study, ctx) => {
  if (study.interventionEvents >= study.interventionTotal) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['interventionEvents'], message: 'Intervention events must be non-all.' });
  }
  if (study.controlEvents >= study.controlTotal) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['controlEvents'], message: 'Control events must be non-all.' });
  }
});

const rawDatasetSchema = z.object({
  synthetic: z.literal(true),
  version: nonEmpty,
  outcome: nonEmpty,
  outcomeDefinition: nonEmpty,
  intervention: nonEmpty,
  comparator: nonEmpty,
  population: nonEmpty,
  followUp: nonEmpty,
  studies: z.array(rawStudySchema).length(6),
}).strict();

const generatedStudySchema = rawStudyBaseSchema.extend({
  effect: z.object({
    rr: z.number().positive(),
    ciLow: z.number().positive(),
    ciHigh: z.number().positive(),
    logRR: z.number(),
    variance: z.number().positive(),
  }).strict(),
}).superRefine((study, ctx) => {
  if (study.interventionEvents >= study.interventionTotal) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['interventionEvents'], message: 'Intervention events must be non-all.' });
  }
  if (study.controlEvents >= study.controlTotal) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['controlEvents'], message: 'Control events must be non-all.' });
  }
});

const synthesisSchema = z.object({
  id: z.enum(['all', 'lower-risk']),
  label: nonEmpty,
  studyIds: z.array(kebabFsId).min(1),
  k: z.number().int().positive(),
  totalParticipants: z.number().int().positive(),
  rr: z.number().positive(),
  ciLow: z.number().positive(),
  ciHigh: z.number().positive(),
  tau2: z.number().nonnegative(),
  i2: z.number().min(0).max(100),
  q: z.number().nonnegative(),
  method: nonEmpty,
  interpretation: nonEmpty,
}).strict();

const analysisSchema: z.ZodType<FoodAnalysis> = z.object({
  synthetic: z.literal(true),
  version: nonEmpty,
  outcome: nonEmpty,
  outcomeDefinition: nonEmpty,
  intervention: nonEmpty,
  comparator: nonEmpty,
  population: nonEmpty,
  followUp: nonEmpty,
  method: nonEmpty,
  software: nonEmpty,
  limitations: z.array(nonEmpty).min(1),
  studies: z.array(generatedStudySchema).length(6),
  syntheses: z.array(synthesisSchema).length(2),
}).strict();

function assertUnique<T>(items: T[], key: (item: T) => string, label: string): void {
  const ids = items.map(key);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} values detected`);
}

const rawDataset = rawDatasetSchema.parse(rawStudiesJson);
const parsedAnalysis = analysisSchema.parse(foodAnalysisJson);

for (const field of ['synthetic', 'outcome', 'outcomeDefinition', 'intervention', 'comparator', 'population', 'followUp'] as const) {
  if (parsedAnalysis[field] !== rawDataset[field]) {
    throw new Error(`Generated analysis metadata mismatch for ${field}`);
  }
}

assertUnique(rawDataset.studies, (study) => study.id, 'raw study id');
assertUnique(parsedAnalysis.studies, (study) => study.id, 'analysis study id');
assertUnique(parsedAnalysis.syntheses, (synthesis) => synthesis.id, 'synthesis id');

const rawById = new Map(rawDataset.studies.map((study) => [study.id, study]));
for (const study of parsedAnalysis.studies) {
  const raw = rawById.get(study.id);
  if (!raw) throw new Error(`Generated study ${study.id} missing from raw source`);
  for (const field of ['name', 'year', 'setting', 'population', 'intervention', 'comparator', 'followUp', 'design', 'riskOfBias', 'biasReason'] as const) {
    if (study[field] !== raw[field]) throw new Error(`Mismatch in ${field} for ${study.id}`);
  }
  for (const field of ['interventionEvents', 'interventionTotal', 'controlEvents', 'controlTotal'] as const) {
    if (study[field] !== raw[field]) throw new Error(`Count mismatch in ${field} for ${study.id}`);
  }
  const { interventionEvents: a, interventionTotal: nI, controlEvents: c, controlTotal: nC } = study;
  const expectedLogRR = Math.log((a / nI) / (c / nC));
  const expectedVariance = (1 / a) - (1 / nI) + (1 / c) - (1 / nC);
  const expectedSE = Math.sqrt(expectedVariance);
  const expectedCiLow = Math.exp(expectedLogRR - (Z_95 * expectedSE));
  const expectedCiHigh = Math.exp(expectedLogRR + (Z_95 * expectedSE));

  for (const value of [
    study.effect.rr,
    study.effect.ciLow,
    study.effect.ciHigh,
    study.effect.logRR,
    study.effect.variance,
  ]) {
    if (!Number.isFinite(value)) throw new Error(`Non-finite effect value for ${study.id}`);
  }

  if (Math.abs(study.effect.logRR - expectedLogRR) > EPSILON) throw new Error(`logRR mismatch for ${study.id}`);
  if (Math.abs(study.effect.variance - expectedVariance) > EPSILON) throw new Error(`variance mismatch for ${study.id}`);
  if (Math.abs(study.effect.rr - Math.exp(expectedLogRR)) > EPSILON) throw new Error(`rr mismatch for ${study.id}`);
  if (Math.abs(study.effect.ciLow - expectedCiLow) > EPSILON) throw new Error(`ciLow mismatch for ${study.id}`);
  if (Math.abs(study.effect.ciHigh - expectedCiHigh) > EPSILON) throw new Error(`ciHigh mismatch for ${study.id}`);
  if (!(study.effect.ciLow < study.effect.rr && study.effect.rr < study.effect.ciHigh)) {
    throw new Error(`Invalid effect confidence interval ordering for ${study.id}`);
  }
}

if (parsedAnalysis.version !== 'food-analysis-v1') throw new Error('Unexpected food analysis version');
if (!parsedAnalysis.method.includes('Paule-Mandel')) throw new Error('Method metadata must name Paule-Mandel');
if (!parsedAnalysis.software.includes('statsmodels 0.14.5')) throw new Error('Software metadata must pin statsmodels version');

const synthesisIds = parsedAnalysis.syntheses.map((item) => item.id).sort();
if (JSON.stringify(synthesisIds) !== JSON.stringify(['all', 'lower-risk'])) {
  throw new Error('Expected synthesis IDs to be exactly [all, lower-risk]');
}

const allSynthesis = parsedAnalysis.syntheses.find((item) => item.id === 'all')!;
const lowerRiskSynthesis = parsedAnalysis.syntheses.find((item) => item.id === 'lower-risk')!;
const allStudyIds = parsedAnalysis.studies.map((study) => study.id);
const lowerRiskExpectedIds = parsedAnalysis.studies.filter((study) => study.riskOfBias !== 'high').map((study) => study.id);

if (JSON.stringify(allSynthesis.studyIds) !== JSON.stringify(allStudyIds)) {
  throw new Error('all synthesis must include every study in source order');
}
if (JSON.stringify(lowerRiskSynthesis.studyIds) !== JSON.stringify(lowerRiskExpectedIds)) {
  throw new Error('lower-risk synthesis must exclude only high-risk studies');
}
if (allSynthesis.k !== allSynthesis.studyIds.length || lowerRiskSynthesis.k !== lowerRiskSynthesis.studyIds.length) {
  throw new Error('Synthesis k must match studyIds length');
}
if (!(allSynthesis.ciLow < allSynthesis.rr && allSynthesis.rr < allSynthesis.ciHigh)) {
  throw new Error('Invalid all synthesis CI ordering');
}
if (!(lowerRiskSynthesis.ciLow < lowerRiskSynthesis.rr && lowerRiskSynthesis.rr < lowerRiskSynthesis.ciHigh)) {
  throw new Error('Invalid lower-risk synthesis CI ordering');
}

for (const synthesis of parsedAnalysis.syntheses) {
  const studiesInSynthesis = synthesis.studyIds.map((id) => rawById.get(id));
  if (studiesInSynthesis.some((study) => !study)) throw new Error(`Synthesis ${synthesis.id} references unknown study id`);
  const participantCount = studiesInSynthesis
    .map((study) => study!)
    .reduce((sum, study) => sum + study.interventionTotal + study.controlTotal, 0);
  if (participantCount !== synthesis.totalParticipants) {
    throw new Error(`totalParticipants mismatch in synthesis ${synthesis.id}`);
  }
}

export const foodAnalysis: FoodAnalysis = parsedAnalysis;
export const foodStudies: FoodStudy[] = parsedAnalysis.studies;
export const foodSyntheses: FoodSynthesis[] = parsedAnalysis.syntheses;

export const confidenceProfile: { domain: string; judgement: string; reason: string }[] = [
  {
    domain: 'Risk of bias',
    judgement: 'Serious concerns (illustrative judgement)',
    reason: 'The synthetic set contains one trial labelled high risk of bias and several labelled some concerns. This is an illustrative domain judgement, not a formal certainty rating.',
  },
  {
    domain: 'Inconsistency',
    judgement: 'No downgrade illustrated',
    reason: 'The synthetic point estimates all favour the offer, but most individual confidence intervals include no difference. I² alone does not establish that the study effects are alike.',
  },
  {
    domain: 'Indirectness',
    judgement: 'Serious concerns (illustrative judgement)',
    reason: 'The synthetic trials cover selected shop users receiving a household-specific offer. Their findings do not directly apply to all households or to changes in shop locations and services.',
  },
  {
    domain: 'Imprecision',
    judgement: 'Not assessed',
    reason: 'No pre-specified policy-relevant effect threshold was set for this synthetic worked example, so an imprecision downgrade is not assigned here.',
  },
  {
    domain: 'Publication/reporting bias',
    judgement: 'Not assessed',
    reason: 'There is no real literature search behind these fabricated trials, so publication and reporting bias cannot be assessed from this set.',
  },
];

export const contextFindings: {
  id: string;
  title: string;
  finding: string;
  source: string;
  relationship: string;
  limitation: string;
}[] = [
  {
    id: 'cf01-affordability-salience',
    title: 'Voucher visibility reduced checkout hesitation',
    finding: 'Participants in the synthetic diaries described clearer basket pricing as reducing hesitation at checkout.',
    source: 'Invented qualitative memo linked to synthetic trials fs01 and fs03',
    relationship: 'Clearer prices are one possible explanation for the higher purchasing probability in this fictional example.',
    limitation: 'Narratives are fictional and were not independently coded by real researchers.',
  },
  {
    id: 'cf02-time-friction',
    title: 'Time pressure still blocked some purchases',
    finding: 'Synthetic observers recorded that households with short shopping windows skipped the healthier basket when locating items took extra time.',
    source: 'Invented process-note pack for synthetic trial fs05',
    relationship: 'Suggests offer design may need time-saving cues in addition to price changes.',
    limitation: 'Observation templates and observer behaviour are hypothetical.',
  },
  {
    id: 'cf03-cultural-fit',
    title: 'Basket familiarity supported uptake',
    finding: 'Synthetic interviewees said uptake improved when promoted basket items matched routine meal preferences.',
    source: 'Invented interview digest attached to synthetic trial fs02',
    relationship: 'In this fictional example, cultural acceptability may affect whether households try the basket.',
    limitation: 'No real communities were sampled; all content is illustrative text.',
  },
  {
    id: 'cf04-trust-in-retailer',
    title: 'Message consistency appeared to build trust',
    finding: 'Synthetic facilitator notes suggest households were more likely to try the basket where retailer messaging looked consistent over visits.',
    source: 'Invented facilitation logs for synthetic trial fs04',
    relationship: 'In this fictional example, trust in the retailer could affect how households respond to a visible offer.',
    limitation: 'This possible mechanism is invented for the demo, not established by research.',
  },
];

export const equityRows: { dimension: string; reported: string; missing: string }[] = [
  {
    dimension: 'Household schedule flexibility',
    reported: 'Illustrative extraction field: free-text note on weekday shopping-time constraints.',
    missing: 'The six fictional trials do not record schedule flexibility as a structured subgroup variable.',
  },
  {
    dimension: 'Transport reliability for shopping trips',
    reported: 'Illustrative extraction field: study notes on reliance on walking or public transport for shopping.',
    missing: 'The six fictional trials do not group results by transport use or test whether it changes the effect.',
  },
  {
    dimension: 'Up-front food budget pressure',
    reported: 'Illustrative extraction field: description of whether households could afford the basket before the intervention.',
    missing: 'The six fictional trials do not group households by their starting food budget.',
  },
  {
    dimension: 'Confidence preparing promoted basket items',
    reported: 'Illustrative extraction field: qualitative note on confidence preparing promoted items.',
    missing: 'The six fictional trials do not measure confidence preparing the basket items as a variable in the analysis.',
  },
];

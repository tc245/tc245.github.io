/** Shared contracts for the synthetic food-access worked example. */
export interface FoodStudy {
  id: string;
  name: string;
  year: number;
  setting: string;
  population: string;
  intervention: string;
  comparator: string;
  followUp: string;
  design: string;
  riskOfBias: 'low' | 'some-concerns' | 'high';
  biasReason: string;
  interventionEvents: number;
  interventionTotal: number;
  controlEvents: number;
  controlTotal: number;
  effect: { rr: number; ciLow: number; ciHigh: number; logRR: number; variance: number };
}
export interface FoodSynthesis {
  id: 'all' | 'lower-risk';
  label: string;
  studyIds: string[];
  k: number;
  totalParticipants: number;
  rr: number;
  ciLow: number;
  ciHigh: number;
  tau2: number;
  i2: number;
  q: number;
  method: string;
  interpretation: string;
}
export interface FoodAnalysis {
  synthetic: true;
  version: string;
  outcome: string;
  outcomeDefinition: string;
  intervention: string;
  comparator: string;
  population: string;
  followUp: string;
  method: string;
  software: string;
  limitations: string[];
  studies: FoodStudy[];
  syntheses: FoodSynthesis[];
}

export interface ScenarioNode { id: number; x: number; y: number }
export interface ScenarioShop { id: string; name: string; nodeId: number; price: number; lateOpening: boolean }
export interface HouseholdProfile { id: string; name: string; description: string }
export interface ScenarioSettings {
  seed: number;
  budget: number;
  selectedShopIds: string[];
  offerPrice: number;
  extendHours: boolean;
  travelAssumption: number;
}
export interface HouseholdView {
  id: number;
  nodeId: number;
  profileId: string;
  foodBudget: number;
  timeBudget: number;
  /** Walking speed in metres per minute. */
  speed: number;
  needsLateOpening: boolean;
  baselineShopId: string | null;
  scenarioShopId: string | null;
  baselineRoute: number[];
  scenarioRoute: number[];
  baselineMinutes: number | null;
  scenarioMinutes: number | null;
}
export interface AccessMetrics {
  total: number;
  accessible: number;
  medianMinutes: number | null;
  groups: { id: string; total: number; accessible: number }[];
}
export interface ScenarioResult {
  modelVersion: string;
  settings: ScenarioSettings;
  cost: number;
  baseline: AccessMetrics;
  scenario: AccessMetrics;
  households: HouseholdView[];
  repetitions: number;
  variation: { baselineLow: number; baselineHigh: number; scenarioLow: number; scenarioHigh: number };
  sensitivity: { assumption: number; baselineAccessible: number; scenarioAccessible: number }[];
}

import type {
  AccessMetrics,
  HouseholdProfile,
  HouseholdView,
  ScenarioNode,
  ScenarioResult,
  ScenarioSettings,
  ScenarioShop,
} from './learning-types';

export const MODEL_VERSION = 'spatial-households-v2';
export const HOUSEHOLD_COUNT = 200;
export const UPGRADE_COST = 2000;
export const HOURS_COST = 500;

const GRID_SIZE = 5;
const EDGE_LENGTH_METERS = 100;
const SHOPPING_MINUTES = 10;
const POPULATION_REPETITIONS = 40;
const LATE_OPENING_NEED_FRACTION = 0.3;

export const NETWORK_NODES: ScenarioNode[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, id) => ({
  id,
  x: id % GRID_SIZE,
  y: Math.floor(id / GRID_SIZE),
}));

export const NETWORK_EDGES: [number, number][] = [];
for (let y = 0; y < GRID_SIZE; y += 1) {
  for (let x = 0; x < GRID_SIZE; x += 1) {
    const nodeId = y * GRID_SIZE + x;
    if (x + 1 < GRID_SIZE) NETWORK_EDGES.push([nodeId, y * GRID_SIZE + (x + 1)]);
    if (y + 1 < GRID_SIZE) NETWORK_EDGES.push([nodeId, (y + 1) * GRID_SIZE + x]);
  }
}

export const SHOPS: ScenarioShop[] = [
  { id: 'shop-a', name: 'Corner Co-op', nodeId: 1, price: 15, lateOpening: false },
  { id: 'shop-b', name: 'Market Lane', nodeId: 4, price: 16, lateOpening: true },
  { id: 'shop-c', name: 'Central Foods', nodeId: 12, price: 14, lateOpening: false },
  { id: 'shop-d', name: 'Dockside Store', nodeId: 20, price: 13, lateOpening: false },
  { id: 'shop-e', name: 'Evening Mart', nodeId: 22, price: 17, lateOpening: true },
  { id: 'shop-f', name: 'Valley Grocer', nodeId: 24, price: 12, lateOpening: false },
];

export const PROFILES: HouseholdProfile[] = [
  {
    id: 'tighter-budgets',
    name: 'Tighter budgets',
    description: 'Lower budget for the specified basket, with moderate time flexibility.',
  },
  {
    id: 'limited-time',
    name: 'Limited time',
    description: 'Less available trip time despite average speed and food budget.',
  },
  {
    id: 'slower-walking',
    name: 'Slower walking',
    description: 'Slower walking speed with otherwise moderate constraints.',
  },
  {
    id: 'fewer-constraints',
    name: 'Fewer constraints',
    description: 'Higher budget and time flexibility in this synthetic population.',
  },
];

type InternalHousehold = {
  id: number;
  nodeId: number;
  profileId: string;
  foodBudget: number;
  timeBudgetBase: number;
  speed: number;
  needsLateOpening: boolean;
};

type PathCache = {
  distanceSteps: number[][];
  routes: number[][][];
};

const ADJACENCY = buildAdjacency();
const PATH_CACHE = precomputeShortestPaths();

export function defaultScenarioSettings(): ScenarioSettings {
  return {
    seed: 42,
    budget: 6000,
    selectedShopIds: [],
    offerPrice: 14,
    extendHours: false,
    travelAssumption: 1,
  };
}

export function validateScenarioSettings(input: unknown): ScenarioSettings {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('Scenario settings must be an object.');
  }

  const source = input as Record<string, unknown>;
  const seed = source.seed;
  const budget = source.budget;
  const selectedShopIds = source.selectedShopIds;
  const offerPrice = source.offerPrice;
  const extendHours = source.extendHours;
  const travelAssumption = source.travelAssumption;

  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 999_999) {
    throw new RangeError('seed must be an integer in the range 0..999999.');
  }
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0 || budget > 20_000) {
    throw new RangeError('budget must be a finite number in the range 0..20000.');
  }
  if (!Array.isArray(selectedShopIds)) {
    throw new TypeError('selectedShopIds must be an array of shop IDs.');
  }
  if (selectedShopIds.length > SHOPS.length) {
    throw new RangeError(`selectedShopIds cannot contain more than ${SHOPS.length} shops.`);
  }

  const validShopIds = new Set(SHOPS.map((shop) => shop.id));
  const seen = new Set<string>();
  const parsedSelected: string[] = [];
  for (const id of selectedShopIds) {
    if (typeof id !== 'string') {
      throw new TypeError('selectedShopIds entries must be strings.');
    }
    if (!validShopIds.has(id)) {
      throw new RangeError(`selectedShopIds contains unknown shop ID: ${id}.`);
    }
    if (seen.has(id)) {
      throw new RangeError(`selectedShopIds contains duplicate shop ID: ${id}.`);
    }
    seen.add(id);
    parsedSelected.push(id);
  }

  if (typeof offerPrice !== 'number' || !Number.isFinite(offerPrice) || offerPrice < 8 || offerPrice > 24) {
    throw new RangeError('offerPrice must be a finite number in the range 8..24.');
  }
  if (typeof extendHours !== 'boolean') {
    throw new TypeError('extendHours must be a boolean.');
  }
  if (typeof travelAssumption !== 'number' || !Number.isFinite(travelAssumption) || travelAssumption < 0.5 || travelAssumption > 1.5) {
    throw new RangeError('travelAssumption must be a finite number in the range 0.5..1.5 (for example 0.8, 1, 1.2).');
  }

  const parsedSeed = seed;
  const parsedBudget = budget;
  const parsedOfferPrice = offerPrice;
  const parsedExtendHours = extendHours;
  const parsedTravelAssumption = travelAssumption;

  return {
    seed: parsedSeed,
    budget: parsedBudget,
    selectedShopIds: parsedSelected,
    offerPrice: parsedOfferPrice,
    extendHours: parsedExtendHours,
    travelAssumption: parsedTravelAssumption,
  };
}

export function runScenario(settingsInput: ScenarioSettings): ScenarioResult {
  const settings = validateScenarioSettings(settingsInput);
  const selected = new Set(settings.selectedShopIds);
  const costPerShop = UPGRADE_COST + (settings.extendHours ? HOURS_COST : 0);
  const cost = selected.size * costPerShop;
  if (cost > settings.budget) {
    throw new RangeError(`Scenario cost ${cost} exceeds available budget ${settings.budget}.`);
  }

  const households = generateHouseholds(settings.seed);
  const baselineOutcome = evaluatePopulation(households, SHOPS, settings.travelAssumption);
  const scenarioShops = applyPolicy(SHOPS, settings.offerPrice, settings.extendHours, selected);
  const scenarioOutcome = evaluatePopulation(households, scenarioShops, settings.travelAssumption);

  const repetitions = repeatedVariation(settings, selected);
  const sensitivityAssumptions = [0.8, 1, 1.2] as const;
  const sensitivity = sensitivityAssumptions.map((assumption) => {
    const baseline = evaluatePopulation(households, SHOPS, assumption).metrics.accessible;
    const scenario = evaluatePopulation(households, scenarioShops, assumption).metrics.accessible;
    return { assumption, baselineAccessible: baseline, scenarioAccessible: scenario };
  });

  return {
    modelVersion: MODEL_VERSION,
    settings,
    cost,
    baseline: baselineOutcome.metrics,
    scenario: scenarioOutcome.metrics,
    households: scenarioOutcome.households,
    repetitions: POPULATION_REPETITIONS,
    variation: repetitions,
    sensitivity,
  };
}

function buildAdjacency(): number[][] {
  const edges = Array.from({ length: NETWORK_NODES.length }, () => [] as number[]);
  for (const [a, b] of NETWORK_EDGES) {
    edges[a].push(b);
    edges[b].push(a);
  }
  for (const neighbours of edges) neighbours.sort((left, right) => left - right);
  return edges;
}

function precomputeShortestPaths(): PathCache {
  const nodeCount = NETWORK_NODES.length;
  const distanceSteps = Array.from({ length: nodeCount }, () => Array(nodeCount).fill(Number.POSITIVE_INFINITY));
  const routes = Array.from({ length: nodeCount }, () => Array.from({ length: nodeCount }, () => [] as number[]));

  for (let source = 0; source < nodeCount; source += 1) {
    const queue: number[] = [source];
    const previous = Array(nodeCount).fill(-1);
    distanceSteps[source][source] = 0;

    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      for (const neighbour of ADJACENCY[node]) {
        if (distanceSteps[source][neighbour] !== Number.POSITIVE_INFINITY) continue;
        distanceSteps[source][neighbour] = distanceSteps[source][node] + 1;
        previous[neighbour] = node;
        queue.push(neighbour);
      }
    }

    for (let target = 0; target < nodeCount; target += 1) {
      if (distanceSteps[source][target] === Number.POSITIVE_INFINITY) {
        routes[source][target] = [];
        continue;
      }
      routes[source][target] = reconstructRoute(source, target, previous);
    }
  }

  return { distanceSteps, routes };
}

function reconstructRoute(source: number, target: number, previous: number[]): number[] {
  if (source === target) return [source];
  const route: number[] = [target];
  let cursor = target;
  while (cursor !== source) {
    cursor = previous[cursor];
    if (cursor === -1) return [];
    route.push(cursor);
  }
  route.reverse();
  return route;
}

function applyPolicy(shops: ScenarioShop[], offerPrice: number, extendHours: boolean, selectedShopIds: Set<string>): ScenarioShop[] {
  return shops.map((shop) => {
    if (!selectedShopIds.has(shop.id)) return shop;
    return {
      ...shop,
      price: offerPrice,
      lateOpening: extendHours ? true : shop.lateOpening,
    };
  });
}

function evaluatePopulation(households: InternalHousehold[], shops: ScenarioShop[], travelAssumption: number): {
  metrics: AccessMetrics;
  households: HouseholdView[];
} {
  const views: HouseholdView[] = households.map((household) => {
    const appliedBudget = round2(household.timeBudgetBase * travelAssumption);
    const baselineChoice = chooseShop(household, SHOPS, appliedBudget);
    const scenarioChoice = chooseShop(household, shops, appliedBudget);

    return {
      id: household.id,
      nodeId: household.nodeId,
      profileId: household.profileId,
      foodBudget: household.foodBudget,
      timeBudget: appliedBudget,
      speed: household.speed,
      needsLateOpening: household.needsLateOpening,
      baselineShopId: baselineChoice.shop?.id ?? null,
      scenarioShopId: scenarioChoice.shop?.id ?? null,
      baselineRoute: baselineChoice.route,
      scenarioRoute: scenarioChoice.route,
      baselineMinutes: baselineChoice.minutes,
      scenarioMinutes: scenarioChoice.minutes,
    };
  });

  return {
    households: views,
    metrics: summarizeAccess(views, 'scenarioShopId', 'scenarioMinutes'),
  };
}

function chooseShop(
  household: InternalHousehold,
  shops: ScenarioShop[],
  appliedTimeBudget: number,
): { shop: ScenarioShop | null; route: number[]; minutes: number | null } {
  let chosen: { shop: ScenarioShop; distanceSteps: number; minutes: number } | null = null;
  for (const shop of shops) {
    if (shop.price > household.foodBudget) continue;
    if (household.needsLateOpening && !shop.lateOpening) continue;
    const steps = PATH_CACHE.distanceSteps[household.nodeId][shop.nodeId];
    if (!Number.isFinite(steps)) continue;
    // Speed is metres per minute, so the distance/speed term is minutes.
    const minutes = round2((2 * steps * EDGE_LENGTH_METERS) / household.speed + SHOPPING_MINUTES);
    if (minutes > appliedTimeBudget) continue;
    if (chosen === null
      || steps < chosen.distanceSteps
      || (steps === chosen.distanceSteps && shop.id < chosen.shop.id)) {
      chosen = { shop, distanceSteps: steps, minutes };
    }
  }

  if (chosen === null) {
    return { shop: null, route: [], minutes: null };
  }
  return {
    shop: chosen.shop,
    route: PATH_CACHE.routes[household.nodeId][chosen.shop.nodeId],
    minutes: chosen.minutes,
  };
}

function summarizeAccess(
  households: HouseholdView[],
  shopField: 'baselineShopId' | 'scenarioShopId',
  minutesField: 'baselineMinutes' | 'scenarioMinutes',
): AccessMetrics {
  const groups = PROFILES.map((profile) => {
    const groupHouseholds = households.filter((household) => household.profileId === profile.id);
    const accessible = groupHouseholds.filter((household) => household[shopField] !== null).length;
    return { id: profile.id, total: groupHouseholds.length, accessible };
  });

  const accessibleHouseholds = households.filter((household) => household[shopField] !== null);
  const accessibleMinutes = accessibleHouseholds
    .map((household) => household[minutesField])
    .filter((minutes): minutes is number => typeof minutes === 'number')
    .sort((left, right) => left - right);

  return {
    total: households.length,
    accessible: accessibleHouseholds.length,
    medianMinutes: median(accessibleMinutes),
    groups,
  };
}

function repeatedVariation(settings: ScenarioSettings, selectedShopIds: Set<string>): {
  baselineLow: number;
  baselineHigh: number;
  scenarioLow: number;
  scenarioHigh: number;
} {
  const scenarioShops = applyPolicy(SHOPS, settings.offerPrice, settings.extendHours, selectedShopIds);
  const baselineCounts: number[] = [];
  const scenarioCounts: number[] = [];

  for (let i = 0; i < POPULATION_REPETITIONS; i += 1) {
    const seed = (settings.seed + 7919 * (i + 1) + 100_003) % 1_000_000;
    const households = generateHouseholds(seed);
    baselineCounts.push(evaluatePopulation(households, SHOPS, settings.travelAssumption).metrics.accessible);
    scenarioCounts.push(evaluatePopulation(households, scenarioShops, settings.travelAssumption).metrics.accessible);
  }

  baselineCounts.sort((left, right) => left - right);
  scenarioCounts.sort((left, right) => left - right);

  return {
    baselineLow: percentileFromSorted(baselineCounts, 0.1),
    baselineHigh: percentileFromSorted(baselineCounts, 0.9),
    scenarioLow: percentileFromSorted(scenarioCounts, 0.1),
    scenarioHigh: percentileFromSorted(scenarioCounts, 0.9),
  };
}

function generateHouseholds(seed: number): InternalHousehold[] {
  const rng = mulberry32(seed);
  const households: InternalHousehold[] = [];
  const profileParameters: Record<string, { budgetBase: number; budgetSpread: number; timeBase: number; timeSpread: number; speedBase: number; speedSpread: number }> = {
    // Deliberately synthetic: include households near the access thresholds so
    // the demonstration can expose time/price/opening trade-offs. Not calibrated
    // to local observations, demographic prevalence or intended health effects.
    'tighter-budgets': { budgetBase: 14, budgetSpread: 4, timeBase: 35, timeSpread: 12, speedBase: 82, speedSpread: 20 },
    'limited-time': { budgetBase: 16, budgetSpread: 4, timeBase: 20, timeSpread: 8, speedBase: 86, speedSpread: 14 },
    'slower-walking': { budgetBase: 16, budgetSpread: 5, timeBase: 25, timeSpread: 12, speedBase: 62, speedSpread: 12 },
    'fewer-constraints': { budgetBase: 19, budgetSpread: 4, timeBase: 45, timeSpread: 16, speedBase: 96, speedSpread: 18 },
  };

  let id = 1;
  for (const profile of PROFILES) {
    const params = profileParameters[profile.id];
    for (let i = 0; i < HOUSEHOLD_COUNT / PROFILES.length; i += 1) {
      const nodeId = Math.floor(rng() * NETWORK_NODES.length);
      const foodBudget = round2(clamp(params.budgetBase + centeredJitter(rng, params.budgetSpread), 8, 24));
      const timeBudgetBase = round2(clamp(params.timeBase + centeredJitter(rng, params.timeSpread), 15, 95));
      const speed = round2(clamp(params.speedBase + centeredJitter(rng, params.speedSpread), 40, 130));
      const needsLateOpening = rng() < LATE_OPENING_NEED_FRACTION;
      households.push({
        id,
        nodeId,
        profileId: profile.id,
        foodBudget,
        timeBudgetBase,
        speed,
        needsLateOpening,
      });
      id += 1;
    }
  }

  return households;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function centeredJitter(rng: () => number, spread: number): number {
  return (rng() - 0.5) * spread;
}

function percentileFromSorted(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const index = Math.floor((values.length - 1) * quantile);
  return values[index];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle];
  return round2((values[middle - 1] + values[middle]) / 2);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

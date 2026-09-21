# Food access: analytical demonstration and scenario model

Start at **`/learning/food-access/`**. The five tabs connect a question overview,
effect estimates, context/equity, a confidence-profile example and a scenario lab.
All sources, trial data, qualitative findings, households, shops and costs are
fictional. None of the displayed estimates is a real finding about any organisation's work.

## Five-minute walkthrough

1. **Overview:** distinguish the purchasing outcome from spatial access. The
   library's 18 records remain a separate demonstration collection; the worked
   analysis adds six clearly identified synthetic trials.
2. **Effects:** inspect the six study estimates and the pooled risk ratio (**1.23**,
   95% CI **1.11–1.37**). Choose **Exclude the high-risk trial**: five studies, RR
   **1.16**, CI **1.05–1.28**. The displayed studies and counts change together.
3. Hide the pooled estimate to inspect individual studies. Change the outcome to
   **Diet quality or health outcomes**: the interface states that it was not
   measured and hides quantitative results. Restore purchasing and try the
   assumed-baseline slider; explain that it performs a conditional translation,
   not a local prediction.
4. **Context & equity / Confidence:** show illustrative qualitative mechanisms,
   missing subgroup information and appraisal domains. Overall certainty is
   explicitly **Not assigned**; this is not a completed GRADE/CERQual assessment.
5. **Scenario lab:** run the default baseline, then **Try a two-shop example**.
   Inspect the paired access counts, profile table and an individual household's
   route. Switch between baseline and alternative. Save as A, change the offer
   price or hours, and compare. An over-budget selection must hide stale results.
6. Open **Population assumptions**, vary available time, then inspect the
   sensitivity table and ranges across synthetic populations. Download the
   scenario JSON, including its settings and model version.

## Statistical specification

The six trials are invented **individually randomised household comparisons**.
The intervention is a household-specific basket voucher and personalised product
information, compared with the usual retailer offer. It is not a store-wide
intervention assigned to only some customers. The outcome is at least one
qualifying basket purchase within four weeks.

For intervention events `a` of `nI`, and control events `c` of `nC`:

```text
RR = (a / nI) / (c / nC)
logRR = log(RR)
variance(logRR) = 1/a - 1/nI + 1/c - 1/nC
95% CI = exp(logRR +/- 1.95996398454 * sqrt(variance))
```

The generator uses `statsmodels.stats.meta_analysis.combine_effects` with the
Paule–Mandel random-effects variance estimator. Pooled estimates use
inverse-variance random-effects weights and conventional normal 95% confidence
intervals. There is **no Hartung–Knapp adjustment or prediction interval** in this
worked example. Method choice would need review for any real synthesis.

There are two prespecified analysis specifications: all six studies, and exclusion
of the single high-risk study. They are calculated before publication. General
library filters never change these analyses. Total participants here means
households, with one entry per independent fictional trial; it is not a count of
people, reports or repeated follow-ups.

The absolute illustration multiplies an assumed baseline probability by the
selected pooled RR and its CI limits. That interval excludes uncertainty in the
assumed baseline and applicability. Risk of bias, heterogeneity and certainty
are separate concepts. Sensitivity results do not automatically change certainty.

### Reproduce the calculations

Use an isolated Python environment with the versions in
`requirements-analysis.txt`:

```sh
python -m pip install -r requirements-analysis.txt
python scripts/analyse_food.py
python scripts/analyse_food.py --check
python scripts/test_food_analysis.py
```

Raw inputs: `src/data/food-studies.json`.
Generated inputs/results: `src/data/food-analysis.json`.
Build validation: `src/lib/food-evidence.ts`.

The generated output is committed/source-controlled with the application when
version control is adopted. Python is not needed by the deployed static site or
normal Docker build. After input edits, regenerate before building: metadata,
counts and individual effect formulas are checked against the raw fixture.

Public exports are `/data/food-analysis.json` and `/data/food-studies.json`.
Individual synthetic source/extraction sheets live under
`/learning/food-access/studies/`.

## Scenario specification

The model is a deterministic spatial-access calculation with heterogeneous
synthetic households. It has no social interaction, adaptive behaviour, queues,
stock depletion, transport other than walking, or local calibration. Animation
replays one inspected route; it does not add a behavioural simulation.

- 5×5 street junctions; each orthogonal edge is 100 metres.
- Six invented shops, with explicit baseline basket prices and hours.
- 200 households, split equally among four illustrative constraint profiles.
- Household constraints are drawn reproducibly from a seeded generator.
- The closest feasible shop is chosen (shop ID breaks distance ties).
- Feasibility requires price within basket budget, compatible hours and
  round-trip walking time **plus 10 shopping minutes** within available time.
- Walking speed is stored in **metres/minute**; the household inspector converts
  it to metres/second for display.
- An intervention replaces prices at selected shops and optionally extends hours.
  Increasing price can worsen access. Costs are £2,000 setup per selected shop
  and £500 extra for hours; recurring costs are outside this illustrative budget.

Population constraints are deliberately chosen to include cases near time and
price thresholds, so the demo can reveal trade-offs. They do not reproduce local
demography or measured behaviour. Before the selected time factor, the seeded
profile parameters are:

| Profile | Basket budget centre ± half-spread | Shopping-time centre ± half-spread | Walking speed centre ± half-spread (m/min) |
|---|---|---|---|
| Tighter budgets | £14 ± £2 | 35 ± 6 minutes | 82 ± 10 |
| Limited time | £16 ± £2 | 20 ± 4 minutes | 86 ± 7 |
| Slower walking | £16 ± £2.50 | 25 ± 6 minutes | 62 ± 6 |
| Fewer constraints | £19 ± £2 | 45 ± 8 minutes | 96 ± 9 |

Draws are bounded in the code; 30% probability of requiring later opening is
another explicit synthetic assumption. No behaviour is assigned by race or ethnicity.

Baseline and alternative always use the **same population** within a run. The
variation panel uses 40 paired population draws and shows 10th/90th percentiles;
these are **not empirical confidence intervals**. The sensitivity table repeats
both baseline and alternative at 0.8, 1.0 and 1.2 times the central available-time
assumption. Median trip time is calculated separately among accessible households
in each scenario, not as a paired time-saving estimate.

The trial purchasing RR is deliberately **not** an access-model parameter. The
evidence ledger explains the endpoint/intervention mismatch. Future integration
would require an explicitly justified model of that relationship.

The browser worker returns versioned results and settings. Stale worker results
are ignored after input changes. Saved A is tab-local; downloaded JSON includes
both current results and saved A, when present. No backend or accounts are needed.

## Verification

```sh
npm run verify
```

Alongside the existing library tests, targeted tests cover statistical reference
values, count/membership consistency, strict input validation, model baselines,
reproducibility, monotonicity, units, paired comparisons, stale-result handling,
downloads, keyboard access, mobile overflow and automated accessibility rules.
The Python tests independently check the statistical calculations and generator.

These are possible capabilities of a commissioned project. Real analyses would depend on the
evidence gathered and on one bounded scenario scoped with the commissioning organisation.
The fabricated prototype is not validation of a future policy model.

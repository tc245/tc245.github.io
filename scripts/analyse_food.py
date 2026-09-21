#!/usr/bin/env python3
"""Generate deterministic synthetic food-offer meta-analysis outputs.

Input:  src/data/food-studies.json
Output: src/data/food-analysis.json
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import scipy
import statsmodels
from statsmodels.stats.meta_analysis import combine_effects

Z_95 = 1.95996398454


@dataclass(frozen=True)
class StudyRow:
    id: str
    name: str
    year: int
    setting: str
    population: str
    intervention: str
    comparator: str
    follow_up: str
    design: str
    risk_of_bias: str
    bias_reason: str
    intervention_events: int
    intervention_total: int
    control_events: int
    control_total: int


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _load_raw(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("synthetic") is not True:
        raise ValueError("Raw input must be marked synthetic=true")
    studies = raw.get("studies")
    if not isinstance(studies, list) or len(studies) != 6:
        raise ValueError("Raw input must contain exactly six synthetic studies")
    return raw


def _strict_int(value: Any, field_name: str, study_id: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field_name} must be an integer in study {study_id}")
    return value


def _to_rows(raw: dict[str, Any]) -> list[StudyRow]:
    rows: list[StudyRow] = []
    seen: set[str] = set()
    for item in raw["studies"]:
        study_id = item["id"]
        if study_id in seen:
            raise ValueError(f"Duplicate study id: {study_id}")
        seen.add(study_id)
        if not isinstance(study_id, str) or not study_id.startswith("fs") or " " in study_id:
            raise ValueError(f"Study id must be safe and fs-prefixed: {study_id}")

        a = _strict_int(item["interventionEvents"], "interventionEvents", study_id)
        n_i = _strict_int(item["interventionTotal"], "interventionTotal", study_id)
        c = _strict_int(item["controlEvents"], "controlEvents", study_id)
        n_c = _strict_int(item["controlTotal"], "controlTotal", study_id)
        if min(a, c) <= 0:
            raise ValueError(f"Zero events are not allowed ({study_id})")
        if a >= n_i or c >= n_c:
            raise ValueError(f"All-event arm is not allowed ({study_id})")
        if not (100 <= n_i <= 300 and 100 <= n_c <= 300):
            raise ValueError(f"Each arm total must be in [100, 300] ({study_id})")

        year = item["year"]
        if isinstance(year, bool) or not isinstance(year, int):
            raise ValueError(f"year must be an integer in study {study_id}")

        rows.append(
            StudyRow(
                id=study_id,
                name=item["name"],
                year=year,
                setting=item["setting"],
                population=item["population"],
                intervention=item["intervention"],
                comparator=item["comparator"],
                follow_up=item["followUp"],
                design=item["design"],
                risk_of_bias=item["riskOfBias"],
                bias_reason=item["biasReason"],
                intervention_events=a,
                intervention_total=n_i,
                control_events=c,
                control_total=n_c,
            )
        )

    high_risk = [row for row in rows if row.risk_of_bias == "high"]
    if len(high_risk) != 1:
        raise ValueError("Exactly one high-risk synthetic study is required for sensitivity demonstration")
    return rows


def _study_effect(study: StudyRow) -> dict[str, float]:
    a = study.intervention_events
    n_i = study.intervention_total
    c = study.control_events
    n_c = study.control_total
    rr = (a / n_i) / (c / n_c)
    log_rr = math.log(rr)
    variance = (1 / a) - (1 / n_i) + (1 / c) - (1 / n_c)
    se = math.sqrt(variance)
    ci_low = math.exp(log_rr - (Z_95 * se))
    ci_high = math.exp(log_rr + (Z_95 * se))
    return {
        "rr": rr,
        "ciLow": ci_low,
        "ciHigh": ci_high,
        "logRR": log_rr,
        "variance": variance,
    }


def _q_fixed(effects: np.ndarray, variances: np.ndarray) -> float:
    weights = 1.0 / variances
    pooled = float(np.sum(weights * effects) / np.sum(weights))
    return float(np.sum(weights * np.square(effects - pooled)))


def _synthesis(label: str, synthesis_id: str, studies: list[dict[str, Any]], interpretation: str) -> dict[str, Any]:
    effects = np.array([study["effect"]["logRR"] for study in studies], dtype=float)
    variances = np.array([study["effect"]["variance"] for study in studies], dtype=float)

    model = combine_effects(effects, variances, method_re="iterated")
    tau2 = float(model.tau2)

    re_weights = 1.0 / (variances + tau2)
    pooled_log_rr = float(np.sum(re_weights * effects) / np.sum(re_weights))
    pooled_se = math.sqrt(1.0 / float(np.sum(re_weights)))
    ci_low = math.exp(pooled_log_rr - (Z_95 * pooled_se))
    ci_high = math.exp(pooled_log_rr + (Z_95 * pooled_se))

    q = _q_fixed(effects, variances)
    df = len(studies) - 1
    i2 = 0.0 if q <= 0 else max(0.0, ((q - df) / q) * 100.0)

    return {
        "id": synthesis_id,
        "label": label,
        "studyIds": [study["id"] for study in studies],
        "k": len(studies),
        "totalParticipants": int(
            sum(study["interventionTotal"] + study["controlTotal"] for study in studies)
        ),
        "rr": math.exp(pooled_log_rr),
        "ciLow": ci_low,
        "ciHigh": ci_high,
        "tau2": tau2,
        "i2": i2,
        "q": q,
        "method": "Random-effects Paule-Mandel via statsmodels combine_effects(method_re='iterated'); conventional normal 95% CI from inverse-variance random-effects weights.",
        "interpretation": interpretation,
    }


def build_analysis(raw: dict[str, Any]) -> dict[str, Any]:
    rows = _to_rows(raw)

    study_entries: list[dict[str, Any]] = []
    for row in rows:
        effect = _study_effect(row)
        study_entries.append(
            {
                "id": row.id,
                "name": row.name,
                "year": row.year,
                "setting": row.setting,
                "population": row.population,
                "intervention": row.intervention,
                "comparator": row.comparator,
                "followUp": row.follow_up,
                "design": row.design,
                "riskOfBias": row.risk_of_bias,
                "biasReason": row.bias_reason,
                "interventionEvents": row.intervention_events,
                "interventionTotal": row.intervention_total,
                "controlEvents": row.control_events,
                "controlTotal": row.control_total,
                "effect": effect,
            }
        )

    all_synthesis = _synthesis(
        label="All synthetic household-randomised trials",
        synthesis_id="all",
        studies=study_entries,
        interpretation=(
            "Across six fictional individually randomised household trials assigned within shared retailers, "
            "household-specific basket vouchers plus personalised product information are associated with a "
            "higher probability of at least one healthier basket purchase within 4 weeks versus usual offer. "
            "This synthetic estimate does not represent shop-cluster assignment and does not estimate the "
            "spatial reach of geographic shop upgrades."
        ),
    )

    lower_risk_studies = [study for study in study_entries if study["riskOfBias"] != "high"]
    lower_risk_synthesis = _synthesis(
        label="Sensitivity variant excluding the single high-risk synthetic trial",
        synthesis_id="lower-risk",
        studies=lower_risk_studies,
        interpretation=(
            "This synthetic sensitivity variant removes fs06-lakeside-highrisk due to high attrition and "
            "post-randomisation exclusions. The pooled effect remains above 1, but this is not a certainty "
            "upgrade and remains an illustrative recalculation over fabricated studies with residual some-concerns risk; "
            "it also does not estimate the spatial reach of shop upgrades."
        ),
    )

    return {
        "synthetic": True,
        "version": "food-analysis-v1",
        "outcome": raw["outcome"],
        "outcomeDefinition": raw["outcomeDefinition"],
        "intervention": raw["intervention"],
        "comparator": raw["comparator"],
        "population": raw["population"],
        "followUp": raw["followUp"],
        "method": "Study-level log risk ratios pooled with a random-effects Paule-Mandel estimator and normal-theory 95% confidence intervals.",
        "software": f"Python 3.12; numpy {np.__version__}; scipy {scipy.__version__}; statsmodels {statsmodels.__version__}",
        "limitations": [
            "All studies and context are fictional synthetic examples for demonstration; they are not real trial evidence.",
            "Household assignment occurred within shared retailers, so this example does not provide shop-cluster evidence.",
            "The intervention estimate concerns household-specific offer uptake and not the spatial reach of geographic shop upgrades.",
            "The worked example uses conventional normal confidence intervals (no Hartung-Knapp adjustment).",
            "Sensitivity analysis excluding the high-risk synthetic study is illustrative and does not establish certainty.",
            "No external literature, claims, or real-world policy inferences should be drawn from fabricated data."
        ],
        "studies": study_entries,
        "syntheses": [all_synthesis, lower_risk_synthesis],
    }


def _serialize(data: dict[str, Any]) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate synthetic food meta-analysis JSON")
    parser.add_argument("--check", action="store_true", help="Fail if committed JSON differs from regenerated output")
    args = parser.parse_args()

    root = _project_root()
    raw_path = root / "src" / "data" / "food-studies.json"
    out_path = root / "src" / "data" / "food-analysis.json"

    raw = _load_raw(raw_path)
    generated = build_analysis(raw)
    content = _serialize(generated)

    if args.check:
        existing = out_path.read_text(encoding="utf-8") if out_path.exists() else ""
        if existing != content:
            raise SystemExit("food-analysis.json is out of date. Run scripts/analyse_food.py to regenerate.")
        return 0

    out_path.write_text(content, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

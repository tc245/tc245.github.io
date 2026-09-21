#!/usr/bin/env python3
"""Targeted tests for synthetic food analysis generation."""

from __future__ import annotations

import json
import math
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from analyse_food import Z_95, build_analysis  # noqa: E402


def _load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class FoodAnalysisTests(unittest.TestCase):
    maxDiff = None

    def setUp(self) -> None:
        self.raw = _load_json(ROOT / "src" / "data" / "food-studies.json")
        self.generated = _load_json(ROOT / "src" / "data" / "food-analysis.json")

    def test_generated_matches_builder_exactly(self) -> None:
        rebuilt = build_analysis(self.raw)
        self.assertEqual(self.generated, rebuilt)

    def test_study_effects_follow_log_rr_and_variance_formula(self) -> None:
        for study in self.generated["studies"]:
            a = study["interventionEvents"]
            n_i = study["interventionTotal"]
            c = study["controlEvents"]
            n_c = study["controlTotal"]
            self.assertGreater(a, 0)
            self.assertGreater(c, 0)
            self.assertLess(a, n_i)
            self.assertLess(c, n_c)

            log_rr = math.log((a / n_i) / (c / n_c))
            variance = (1 / a) - (1 / n_i) + (1 / c) - (1 / n_c)
            se = math.sqrt(variance)
            ci_low = math.exp(log_rr - Z_95 * se)
            ci_high = math.exp(log_rr + Z_95 * se)

            self.assertAlmostEqual(study["effect"]["logRR"], log_rr, places=12)
            self.assertAlmostEqual(study["effect"]["variance"], variance, places=12)
            self.assertAlmostEqual(study["effect"]["rr"], math.exp(log_rr), places=12)
            self.assertAlmostEqual(study["effect"]["ciLow"], ci_low, places=12)
            self.assertAlmostEqual(study["effect"]["ciHigh"], ci_high, places=12)
            self.assertGreater(study["effect"]["ciLow"], 0)
            self.assertGreater(study["effect"]["ciHigh"], 0)

    def test_independent_random_effect_weighted_pooling_matches_output(self) -> None:
        by_id = {s["id"]: s for s in self.generated["studies"]}
        for synthesis in self.generated["syntheses"]:
            subset = [by_id[i] for i in synthesis["studyIds"]]
            effects = [s["effect"]["logRR"] for s in subset]
            variances = [s["effect"]["variance"] for s in subset]
            tau2 = synthesis["tau2"]
            weights = [1.0 / (v + tau2) for v in variances]
            pooled = sum(w * y for w, y in zip(weights, effects)) / sum(weights)
            se = math.sqrt(1.0 / sum(weights))
            ci_low = math.exp(pooled - Z_95 * se)
            ci_high = math.exp(pooled + Z_95 * se)
            rr = math.exp(pooled)

            fixed_weights = [1.0 / v for v in variances]
            fixed_pool = sum(w * y for w, y in zip(fixed_weights, effects)) / sum(fixed_weights)
            q = sum(w * (y - fixed_pool) ** 2 for w, y in zip(fixed_weights, effects))
            df = len(subset) - 1
            i2 = max(0.0, ((q - df) / q) * 100.0) if q > 0 else 0.0

            self.assertAlmostEqual(synthesis["rr"], rr, places=12)
            self.assertAlmostEqual(synthesis["ciLow"], ci_low, places=12)
            self.assertAlmostEqual(synthesis["ciHigh"], ci_high, places=12)
            self.assertAlmostEqual(synthesis["q"], q, places=12)
            self.assertAlmostEqual(synthesis["i2"], i2, places=12)

    def test_check_mode_is_reproducible(self) -> None:
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "analyse_food.py"), "--check"],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr + result.stdout)

    def test_rejects_non_integer_count_values(self) -> None:
        bad = json.loads(json.dumps(self.raw))
        bad["studies"][0]["interventionEvents"] = 72.9
        with self.assertRaisesRegex(ValueError, "interventionEvents must be an integer"):
            build_analysis(bad)

        bad_bool = json.loads(json.dumps(self.raw))
        bad_bool["studies"][0]["controlTotal"] = True
        with self.assertRaisesRegex(ValueError, "controlTotal must be an integer"):
            build_analysis(bad_bool)


if __name__ == "__main__":
    unittest.main()

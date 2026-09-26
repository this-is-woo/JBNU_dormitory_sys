"""전북대 생활관 선발 환산점수 계산.

프론트엔드 frontend/src/lib/score.js 와 같은 규칙을 유지해야 한다.
거리점수 표(app/data/distance_scores.json)는 scripts/build_regions.py 로 생성한다.
"""

import json
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from pathlib import Path

DISTANCE_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "distance_scores.json"

GPA_MAX = Decimal("4.5")
POINT_WEIGHT = Decimal("0.009")
_TWO_PLACES = Decimal("0.01")


@dataclass(frozen=True)
class DistanceInfo:
    sido: str
    name: str
    km: float
    score: Decimal
    note: str | None = None

    @property
    def region_name(self) -> str:
        return self.name if self.name == self.sido else f"{self.sido} {self.name}"


@dataclass(frozen=True)
class ScoreResult:
    grade_score: Decimal
    distance_score: Decimal
    converted_score: Decimal


@lru_cache
def load_distance_table() -> dict[str, DistanceInfo]:
    raw = json.loads(DISTANCE_DATA_PATH.read_text(encoding="utf-8"))
    return {
        code: DistanceInfo(
            sido=v["sido"],
            name=v["name"],
            km=v["km"],
            score=Decimal(str(v["score"])),
            note=v.get("note"),
        )
        for code, v in raw["sigungu"].items()
    }


def get_distance(sigungu_code: str) -> DistanceInfo | None:
    return load_distance_table().get(sigungu_code)


def round2(value: Decimal) -> Decimal:
    """소수점 셋째 자리에서 반올림"""
    return value.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def grade_score(gpa: Decimal, merit: int, demerit: int) -> Decimal:
    """성적점수 = ((학점 + (상점 × 0.009 − 벌점 × 0.009)) / 4.5) × 90"""
    return (gpa + (merit * POINT_WEIGHT - demerit * POINT_WEIGHT)) * 90 / GPA_MAX


def compute_scores(gpa: Decimal, merit: int, demerit: int, distance_score: Decimal) -> ScoreResult:
    """환산점수 = 성적점수 + 거리점수(5 ~ 10점)"""
    grade = grade_score(gpa, merit, demerit)
    return ScoreResult(
        grade_score=round2(grade),
        distance_score=distance_score,
        converted_score=round2(grade + distance_score),
    )

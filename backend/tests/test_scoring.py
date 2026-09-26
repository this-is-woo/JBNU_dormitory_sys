import math
from decimal import Decimal

import pytest

from app.services.scoring import compute_scores, get_distance, load_distance_table


def test_formula_example():
    # 학점 3.85, 상점 2, 벌점 0, 서울 종로구(7.50)
    result = compute_scores(Decimal("3.85"), 2, 0, Decimal("7.50"))
    assert result.grade_score == Decimal("77.36")
    assert result.converted_score == Decimal("84.86")


def test_demerit_is_subtracted():
    result = compute_scores(Decimal("3.00"), 0, 10, Decimal("5.00"))
    # (3.0 - 0.09) / 4.5 * 90 = 58.2
    assert result.converted_score == Decimal("63.20")


def test_perfect_score():
    assert compute_scores(Decimal("4.5"), 0, 0, Decimal("10")).converted_score == Decimal("100.00")


@pytest.mark.parametrize(
    ("code", "score"),
    [
        ("52111", Decimal("5.00")),  # 전주시 완산구
        ("36110", Decimal("6.00")),  # 세종특별자치시
        ("50110", Decimal("10.00")),  # 제주시
        ("41192", Decimal("7.50")),  # 부천시 원미구 (거리표의 부천시 값)
    ],
)
def test_distance_lookup(code, score):
    assert get_distance(code).score == score


def test_distance_table_follows_official_rule():
    # 20km마다 0.25점, 5 ~ 10점
    for info in load_distance_table().values():
        assert info.score == Decimal(str(min(10.0, 5.0 + 0.25 * math.floor(info.km / 20))))

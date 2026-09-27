"""임시 예측기의 확률 곡선: 기준점 ±5점 안은 완만하게, 밖은 급격하게."""

import pytest

from app.services.predictor import BaselinePredictor, cutoff_probability


def test_center_and_band_edges():
    assert cutoff_probability(0) == pytest.approx(0.5)
    assert cutoff_probability(-5) == pytest.approx(0.10)
    assert cutoff_probability(5) == pytest.approx(0.90)


def test_symmetric():
    for d in (0.5, 2, 4.9, 5.5, 7):
        assert cutoff_probability(d) + cutoff_probability(-d) == pytest.approx(1.0)


def test_continuous_at_band_edge():
    assert cutoff_probability(-5.0001) == pytest.approx(cutoff_probability(-4.9999), abs=1e-3)
    assert cutoff_probability(5.0001) == pytest.approx(cutoff_probability(4.9999), abs=1e-3)


def test_drops_sharply_outside_band():
    inside_step = cutoff_probability(-4) - cutoff_probability(-5)  # 구간 안 마지막 1점
    outside_step = cutoff_probability(-5) - cutoff_probability(-6)  # 구간 밖 첫 1점
    assert outside_step > inside_step
    assert cutoff_probability(-6) < 0.05
    assert cutoff_probability(-7) < 0.02
    assert cutoff_probability(6) > 0.95


def test_monotonic_and_never_certain():
    values = [cutoff_probability(d / 10) for d in range(-200, 201)]
    assert all(a <= b for a, b in zip(values, values[1:]))
    assert min(values) == pytest.approx(0.01)
    assert max(values) == pytest.approx(0.99)


def test_baseline_uses_curve():
    # 창의관 1인실 남학생 기준점 95.5: 5점 아래(90.5)는 10%, 7점 아래는 2% 미만
    predict = BaselinePredictor().predict
    base = {"gender": "남", "college": "engineering"}
    assert predict({**base, "converted_score": 90.5})["changui_1"] == pytest.approx(0.10)
    assert predict({**base, "converted_score": 88.5})["changui_1"] < 0.02

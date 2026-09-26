import json

import numpy as np
import pytest

from app.dormitories import DORM_ROOM_CODES
from app.services.predictor import BaselinePredictor, OnnxPredictor

onnx = pytest.importorskip("onnx")
from onnx import TensorProto, helper  # noqa: E402

FEATURES = ["gpa", "merit", "demerit", "distance_score", "converted_score", "college:engineering"]
OUTPUTS = ["changui_1", "changui_2", "hanbit_2", "saebit_2", "hanbit_4", "daedong_2", "chambit_2"]
SAMPLE = {
    "college": "engineering",
    "gpa": 3.85,
    "merit": 2,
    "demerit": 0,
    "distance_km": 208.0,
    "distance_score": 7.5,
    "grade_score": 77.36,
    "converted_score": 84.86,
}


def write_linear_model(path, weight, bias):
    """y = x·W + b 인 ONNX 모델 (Colab 에서 내보낸 모델 대용)"""
    graph = helper.make_graph(
        [helper.make_node("Gemm", ["input", "W", "B"], ["output"])],
        "linear",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, len(FEATURES)])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, len(OUTPUTS)])],
        [
            helper.make_tensor("W", TensorProto.FLOAT, weight.shape, weight.flatten().tolist()),
            helper.make_tensor("B", TensorProto.FLOAT, bias.shape, bias.tolist()),
        ],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8
    onnx.save(model, path)


def test_onnx_predictor(tmp_path):
    weight = np.zeros((len(FEATURES), len(OUTPUTS)), dtype=np.float32)
    weight[4, :] = 1.0  # 정규화된 환산점수
    weight[5, :] = 0.5  # 공과대학 원-핫
    bias = np.linspace(-1, 1, len(OUTPUTS)).astype(np.float32)
    write_linear_model(tmp_path / "model.onnx", weight, bias)
    (tmp_path / "meta.json").write_text(
        json.dumps(
            {
                "version": "test",
                "features": FEATURES,
                "scaler": {"mean": [0, 0, 0, 0, 80.0, 0], "scale": [1, 1, 1, 1, 10.0, 1]},
                "outputs": OUTPUTS,
                "output_activation": "sigmoid",
            }
        ),
        encoding="utf-8",
    )

    predictor = OnnxPredictor(tmp_path / "model.onnx", tmp_path / "meta.json")
    probs = predictor.predict(SAMPLE)

    assert predictor.mode == "model" and predictor.version == "test"
    expected = 1 / (1 + np.exp(-((84.86 - 80.0) / 10.0 + 0.5 + bias)))
    assert np.allclose([probs[c] for c in OUTPUTS], expected, atol=1e-5)

    # 다른 단과대학이면 원-핫 값이 0
    other = predictor.predict({**SAMPLE, "college": "business"})
    assert other["changui_1"] < probs["changui_1"]


def test_onnx_predictor_rejects_unknown_room(tmp_path):
    write_linear_model(
        tmp_path / "model.onnx",
        np.zeros((len(FEATURES), len(OUTPUTS)), dtype=np.float32),
        np.zeros(len(OUTPUTS), dtype=np.float32),
    )
    (tmp_path / "meta.json").write_text(
        json.dumps({"features": FEATURES, "outputs": OUTPUTS[:-1] + ["unknown"]}), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="호실 유형 code"):
        OnnxPredictor(tmp_path / "model.onnx", tmp_path / "meta.json")


def test_baseline_covers_all_dorms():
    probs = BaselinePredictor().predict(SAMPLE)
    assert set(probs) == DORM_ROOM_CODES
    assert all(0 < p < 1 for p in probs.values())


def test_baseline_by_gender():
    male = BaselinePredictor().predict({**SAMPLE, "gender": "남"})
    female = BaselinePredictor().predict({**SAMPLE, "gender": "여"})
    assert "saebit_2" not in male and "hanbit_2" not in female
    assert female["changui_1"] < male["changui_1"]
    # 창의관 1인실은 95 ~ 97점대라 다른 호실보다 훨씬 어렵다
    assert male["changui_1"] == min(male.values())


def test_baseline_changui_1_cutoff():
    probs = BaselinePredictor().predict({**SAMPLE, "gender": "남", "converted_score": 95.5})
    assert abs(probs["changui_1"] - 0.5) < 1e-9

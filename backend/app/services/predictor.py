"""생활관별 합격 확률 예측기.

- models/model.onnx 와 models/model_meta.json 이 있으면 Colab 에서 학습한 ONNX 모델을 쓴다. (mode="model")
- 없으면 임시 기준점으로 계산하는 BaselinePredictor 를 쓴다. (mode="baseline")

예측 단위는 생활관 '호실 유형'(예: 창의관 1인실)이다. (app/dormitories.py 의 DORM_ROOMS)
모델에 넣을 수 있는 특성(feature) 이름은 FEATURE_NAMES 와 "college:<단과대학 code>"(원-핫) 이다.
model_meta.json 형식은 models/README.md 에 정리되어 있다.
"""

import json
import logging
import math
from pathlib import Path
from typing import Protocol

from app.config import Settings
from app.colleges import COLLEGES_BY_CODE
from app.dormitories import DORM_ROOM_CODES, DORM_ROOMS

logger = logging.getLogger(__name__)

FEATURE_NAMES = (
    "gpa",  # 직전 학기 평점
    "merit",  # 상점
    "demerit",  # 벌점
    "distance_km",  # 생활관 관리동 ~ 시·군·구청 거리
    "distance_score",  # 거리점수 (5 ~ 10)
    "grade_score",  # 성적점수 (90점 만점 환산)
    "converted_score",  # 환산점수
    "is_female",  # 여학생 1, 남학생 0 (성별을 보내지 않은 옛 요청은 0.5)
)
COLLEGE_PREFIX = "college:"  # 예: "college:engineering" → 공과대학이면 1, 아니면 0


def feature_value(features: dict, name: str) -> float:
    if name.startswith(COLLEGE_PREFIX):
        return 1.0 if features["college"] == name.removeprefix(COLLEGE_PREFIX) else 0.0
    return float(features[name])


class Predictor(Protocol):
    mode: str
    version: str

    def predict(self, features: dict) -> dict[str, float]:
        """특성 dict(숫자 특성 + "college" + "gender") → {호실 유형 code: 합격 확률(0~1)}"""
        ...


class BaselinePredictor:
    """모델 연결 전 임시 예측: 환산점수와 호실 유형·성별 가상 기준점의 차이를 로지스틱 함수로 변환.

    성별을 모르면(옛 요청) 그 호실에 지원할 수 있는 성별의 기준점 평균을 쓴다.
    """

    mode = "baseline"
    version = "baseline-v0"
    scale = 3.0

    def predict(self, features: dict) -> dict[str, float]:
        score = features["converted_score"]
        gender = features.get("gender")
        result = {}
        for r in DORM_ROOMS:
            cutoffs = r.baseline_cutoffs
            if gender is not None and gender not in cutoffs:
                continue
            cutoff = cutoffs[gender] if gender is not None else sum(cutoffs.values()) / len(cutoffs)
            result[r.code] = 1 / (1 + math.exp(-(score - cutoff) / self.scale))
        return result


class OnnxPredictor:
    mode = "model"

    def __init__(self, model_path: Path, meta_path: Path) -> None:
        # 모델을 쓸 때만 필요한 무거운 의존성
        import numpy as np
        import onnxruntime as ort

        self._np = np
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        self.version = str(meta.get("version", "unknown"))
        self.features: list[str] = meta["features"]
        self.outputs: list[str] = meta["outputs"]
        self.activation: str = meta.get("output_activation", "sigmoid")

        unknown_features = {
            f
            for f in self.features
            if f not in FEATURE_NAMES and f.removeprefix(COLLEGE_PREFIX) not in COLLEGES_BY_CODE
        }
        if unknown_features:
            raise ValueError(f"model_meta.json 의 알 수 없는 feature: {sorted(unknown_features)}")
        unknown_rooms = set(self.outputs) - DORM_ROOM_CODES
        if unknown_rooms:
            raise ValueError(f"model_meta.json 의 알 수 없는 호실 유형 code: {sorted(unknown_rooms)}")
        if self.activation not in ("sigmoid", "none"):
            raise ValueError("output_activation 은 'sigmoid' 또는 'none' 이어야 합니다.")

        n = len(self.features)
        scaler = meta.get("scaler") or {}
        self.mean = np.asarray(scaler.get("mean", [0.0] * n), dtype=np.float32)
        self.scale = np.asarray(scaler.get("scale", [1.0] * n), dtype=np.float32)
        if self.mean.shape != (n,) or self.scale.shape != (n,):
            raise ValueError("scaler.mean / scaler.scale 길이가 features 와 같아야 합니다.")

        self.session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name

    def predict(self, features: dict) -> dict[str, float]:
        np = self._np
        x = np.asarray([[feature_value(features, name) for name in self.features]], dtype=np.float32)
        x = (x - self.mean) / self.scale
        y = np.asarray(self.session.run(None, {self.input_name: x})[0], dtype=np.float64).reshape(-1)
        if y.shape[0] != len(self.outputs):
            raise ValueError(f"모델 출력 개수({y.shape[0]})가 outputs({len(self.outputs)})와 다릅니다.")
        if self.activation == "sigmoid":
            y = 1 / (1 + np.exp(-y))
        return dict(zip(self.outputs, np.clip(y, 0.0, 1.0).tolist()))


def load_predictor(settings: Settings) -> Predictor:
    if settings.model_path.exists() and settings.model_meta_path.exists():
        try:
            predictor = OnnxPredictor(settings.model_path, settings.model_meta_path)
            logger.info("ONNX 모델을 불러왔습니다. version=%s", predictor.version)
            return predictor
        except Exception:
            logger.exception("ONNX 모델을 불러오지 못해 임시 예측기로 대체합니다.")
    else:
        logger.info("모델 파일이 없어 임시 예측기를 사용합니다: %s", settings.model_path)
    return BaselinePredictor()

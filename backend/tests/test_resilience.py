"""서버가 예상 밖의 상황에서도 멈추지 않고 알아들을 수 있는 응답을 주는지"""

import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import supabase_client

VALID = {
    "collegeCode": "engineering",
    "gender": "남",
    "gpa": 3.85,
    "merit": 2,
    "demerit": 0,
    "sidoCode": "11",
    "sigunguCode": "11110",
}
ORIGIN = "http://localhost:5173"


class BrokenModel:
    """실행 중에 실패하는 모델"""

    mode = "model"
    version = "broken"

    def predict(self, features):
        raise RuntimeError("onnx output shape mismatch")


class NanModel:
    """NaN·범위 밖 값을 내는 모델"""

    mode = "model"
    version = "nan"

    def predict(self, features):
        return {"changui_1": math.nan, "changui_2": 1.7, "hanbit_2": -0.2, "hanbit_4": 0.4}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def use_model(client, model):
    client.app.state.predictor = model


def test_model_failure_falls_back_to_baseline(client):
    use_model(client, BrokenModel())
    res = client.post("/api/v1/predict", json=VALID)
    assert res.status_code == 200
    body = res.json()
    assert body["model"]["mode"] == "baseline"  # 실제로 쓴 예측기를 알려 준다
    assert body["predictions"]


def test_non_finite_probabilities_are_dropped_and_clamped(client):
    use_model(client, NanModel())
    res = client.post("/api/v1/predict", json=VALID)
    assert res.status_code == 200
    probs = {p["code"]: p["probability"] for p in res.json()["predictions"]}
    assert "changui_1" not in probs  # NaN 은 뺀다
    assert probs["changui_2"] == 1.0 and probs["hanbit_2"] == 0.0 and probs["hanbit_4"] == 0.4


def test_unexpected_error_is_json_with_cors(client, monkeypatch):
    from app.routers import predict as predict_router

    def boom(*args, **kwargs):
        raise ValueError("distance table corrupted")

    monkeypatch.setattr(predict_router, "get_distance", boom)
    res = client.post("/api/v1/predict", json=VALID, headers={"Origin": ORIGIN})
    assert res.status_code == 500
    assert "문제가 생겼어요" in res.json()["detail"]
    assert res.headers.get("access-control-allow-origin") == ORIGIN  # 브라우저가 오류 내용을 읽을 수 있다


def test_bad_supabase_config_does_not_break_health(client, monkeypatch):
    from app.config import Settings

    monkeypatch.setattr(supabase_client, "get_settings", lambda: Settings(supabase_url="not a url", supabase_secret_key="x"))
    supabase_client.get_supabase.cache_clear()
    try:
        assert supabase_client.get_supabase() is None
        monkeypatch.setattr(supabase_client, "_last_keepalive", 0.0)
        assert client.get("/health").status_code == 200
    finally:
        supabase_client.get_supabase.cache_clear()


def test_prediction_log_retries_without_gender(monkeypatch):
    from postgrest.exceptions import APIError

    from app.schemas import PredictRequest, PredictResponse

    inserted = []

    class Table:
        def insert(self, row):
            self.row = row
            return self

        def execute(self):
            if "gender" in self.row:
                raise APIError({"code": "PGRST204", "message": "Could not find the 'gender' column of 'prediction_logs'"})
            inserted.append(self.row)

    class Client:
        def table(self, name):
            return Table()

    monkeypatch.setattr(supabase_client, "get_supabase", lambda: Client())
    with TestClient(app) as c:
        c.app.state.predictor = __import__("app.services.predictor", fromlist=["BaselinePredictor"]).BaselinePredictor()
        body = c.post("/api/v1/predict", json=VALID).json()
    supabase_client.log_prediction(PredictRequest(**VALID), PredictResponse(**body))
    assert len(inserted) == 1 and "gender" not in inserted[0] and inserted[0]["college_code"] == "engineering"

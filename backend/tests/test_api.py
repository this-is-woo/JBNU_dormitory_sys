import pytest
from fastapi.testclient import TestClient

from app.main import app

VALID = {
    "collegeCode": "engineering",
    "gender": "남",
    "gpa": 3.85,
    "merit": 2,
    "demerit": 0,
    "sidoCode": "11",
    "sigunguCode": "11110",
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_get_and_head(client):
    assert client.get("/health").json()["status"] == "ok"
    assert client.head("/health").status_code == 200


def test_predict(client):
    res = client.post("/api/v1/predict", json=VALID)
    assert res.status_code == 200
    body = res.json()
    assert body["score"] == {
        "gradeScore": 77.36,
        "distanceScore": 7.5,
        "convertedScore": 84.86,
        "distanceKm": 208.1,
        "regionName": "서울특별시 종로구",
    }
    codes = [p["code"] for p in body["predictions"]]
    # 남학생: 여학생 전용인 새빛관은 빠진다
    assert codes == ["changui_1", "changui_2", "hanbit_2", "hanbit_4", "daedong_2", "chambit_2"]
    assert all(0 <= p["probability"] <= 1 for p in body["predictions"])
    assert body["collegeName"] == "공과대학"
    assert body["notice"] is None
    assert body["model"]["mode"] in ("model", "baseline")


def room_codes(client, college, **patch):
    res = client.post("/api/v1/predict", json={**VALID, "collegeCode": college, **patch})
    return {p["code"] for p in res.json()["predictions"]}


def probabilities(client, **patch):
    res = client.post("/api/v1/predict", json={**VALID, **patch})
    return {p["code"]: p["probability"] for p in res.json()["predictions"]}


def test_female_rooms(client):
    # 여학생: 남학생 전용인 한빛관·대동관이 빠지고 새빛관이 들어온다
    assert room_codes(client, "engineering", gender="여") == {"changui_1", "changui_2", "saebit_2", "chambit_2"}


def test_gender_changes_baseline(client):
    if client.app.state.predictor.mode != "baseline":
        pytest.skip("임시 예측기일 때만 확인")
    # 같은 점수라도 여학생 기준점이 더 높다
    assert probabilities(client, gender="여")["changui_2"] < probabilities(client, gender="남")["changui_2"]


def test_gender_optional_for_old_clients(client):
    # 성별을 보내지 않는 예전 화면: 성별 구분 없이 모든 호실
    body = {k: v for k, v in VALID.items() if k != "gender"}
    res = client.post("/api/v1/predict", json=body)
    assert res.status_code == 200
    assert "saebit_2" in {p["code"] for p in res.json()["predictions"]}
    assert "hanbit_2" in {p["code"] for p in res.json()["predictions"]}


def test_medical_colleges_include_hyemin(client):
    assert {"hyemin_1", "hyemin_2"} <= room_codes(client, "medicine")
    assert "hyemin_1" not in room_codes(client, "engineering")


def test_law_school_only_changui(client):
    # 법학전문대학원은 창의관(D타입)만 지원 가능
    assert room_codes(client, "law") == {"changui_1", "changui_2"}


def test_predict_special_campus_college(client):
    body = client.post("/api/v1/predict", json={**VALID, "collegeCode": "environment"}).json()
    assert body["predictions"] == []
    assert "특성화캠퍼스" in body["notice"]


@pytest.mark.parametrize(
    "patch",
    [
        {"gpa": 4.6},
        {"gpa": 0.9},
        {"gpa": 3.855},
        {"merit": 100},
        {"demerit": -1},
        {"sidoCode": "26"},  # 시/도와 맞지 않는 시/군/구
        {"sigunguCode": "11999"},  # 거리표에 없는 시/군/구
        {"collegeCode": "unknown"},
        {"gender": "male"},
    ],
)
def test_predict_rejects_invalid_input(client, patch):
    res = client.post("/api/v1/predict", json={**VALID, **patch})
    assert res.status_code == 422
    assert isinstance(res.json()["detail"], str)


def test_cors_preflight(client):
    res = client.options(
        "/api/v1/predict",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_health_keepalive_is_throttled(client, monkeypatch):
    from app.routers import health as health_router
    from app.services import supabase_client

    calls = []
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: object())
    monkeypatch.setattr(supabase_client, "_last_keepalive", 0.0)
    monkeypatch.setattr(health_router, "keepalive", lambda: calls.append(1))

    for _ in range(3):
        assert client.get("/health").status_code == 200
    assert calls == [1]  # 6시간 안에는 한 번만

    assert supabase_client.keepalive_due(now=supabase_client._last_keepalive + supabase_client.KEEPALIVE_INTERVAL)

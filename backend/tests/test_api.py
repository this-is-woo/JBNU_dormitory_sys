import pytest
from fastapi.testclient import TestClient

from app.main import app

VALID = {
    "collegeCode": "engineering",
    "gpa": 3.85,
    "merit": 2,
    "demerit": 0,
    "sidoCode": "11",
    "sigunguCode": "11110",
    "emdCode": "1111010100",
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
        "distanceKm": 208.0,
        "regionName": "서울특별시 종로구",
    }
    codes = [p["code"] for p in body["predictions"]]
    assert codes == ["changui_1", "changui_2", "hanbit_2", "saebit_2", "hanbit_6", "daedong_2", "chambit_2"]
    assert all(0 <= p["probability"] <= 1 for p in body["predictions"])
    assert body["collegeName"] == "공과대학"
    assert body["notice"] is None
    assert body["model"]["mode"] in ("model", "baseline")


def room_codes(client, college):
    res = client.post("/api/v1/predict", json={**VALID, "collegeCode": college})
    return {p["code"] for p in res.json()["predictions"]}


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
        {"emdCode": "1168010100"},  # 다른 시/군/구의 동
        {"collegeCode": "unknown"},
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

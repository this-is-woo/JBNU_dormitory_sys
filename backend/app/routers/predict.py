import logging
import math

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.colleges import COLLEGES_BY_CODE
from app.config import get_settings
from app.dormitories import eligible_rooms
from app.schemas import ModelInfo, PredictRequest, PredictResponse, RoomPrediction, ScoreBreakdown
from app.services.predictor import BaselinePredictor
from app.services.scoring import compute_scores, get_distance
from app.services.supabase_client import log_prediction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["predict"])

# 뜻밖의 오류도 JSON 으로 돌려준다. (처리되지 않은 예외의 500 응답에는 CORS 헤더가 붙지 않아,
# 브라우저가 "서버에 연결할 수 없음"으로 잘못 알리게 된다)
UNEXPECTED_ERROR = "합격률을 계산하는 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요."

SPECIAL_CAMPUS_NOTICE = "{college} 학생은 특성화캠퍼스(익산) 생활관만 지원할 수 있어 전주캠퍼스 생활관 합격률을 계산하지 않습니다."


def run_predictor(predictor, features: dict):
    """모델로 예측한다. 모델이 실행 중에 실패하면 임시 기준점 예측으로 대신한다. → (확률, 실제로 쓴 예측기)"""
    try:
        return predictor.predict(features), predictor
    except Exception:
        if isinstance(predictor, BaselinePredictor):
            raise
        logger.exception("모델 예측에 실패해 임시 예측기로 대신합니다.")
        fallback = BaselinePredictor()
        return fallback.predict(features), fallback


@router.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest, request: Request, background: BackgroundTasks) -> PredictResponse:
    """단과대학·성별·학점·주소지·상벌점으로 환산점수를 계산하고 호실 유형별 합격 확률을 예측한다."""
    try:
        return predict_admission(body, request, background)
    except HTTPException:
        raise
    except Exception:
        logger.exception("예측 요청 처리 중 오류")
        raise HTTPException(status_code=500, detail=UNEXPECTED_ERROR) from None


def predict_admission(body: PredictRequest, request: Request, background: BackgroundTasks) -> PredictResponse:
    distance = get_distance(body.sigungu_code)
    if distance is None:
        raise HTTPException(status_code=422, detail="거리점수 데이터가 없는 시/군/구입니다.")

    college = COLLEGES_BY_CODE[body.college_code]
    scores = compute_scores(body.gpa, body.merit, body.demerit, distance.score)
    rooms = eligible_rooms(college.code, body.gender)
    predictor = request.app.state.predictor

    probabilities = {}
    if rooms:
        probabilities, predictor = run_predictor(
            predictor,
            {
                "college": college.code,
                "gender": body.gender,
                "is_female": {"여": 1.0, "남": 0.0}.get(body.gender, 0.5),
                "gpa": float(body.gpa),
                "merit": body.merit,
                "demerit": body.demerit,
                "distance_km": distance.km,
                "distance_score": float(scores.distance_score),
                "grade_score": float(scores.grade_score),
                "converted_score": float(scores.converted_score),
            },
        )
    # 모델이 NaN·범위 밖 값을 내도 응답 형식(0~1)이 깨지지 않게
    probabilities = {
        code: min(1.0, max(0.0, float(p))) for code, p in probabilities.items() if p is not None and math.isfinite(p)
    }

    response = PredictResponse(
        college_name=college.name,
        score=ScoreBreakdown(
            grade_score=float(scores.grade_score),
            distance_score=float(scores.distance_score),
            converted_score=float(scores.converted_score),
            distance_km=distance.km,
            region_name=distance.region_name,
        ),
        predictions=[
            RoomPrediction(
                code=r.code,
                name=r.name,
                dormitory=r.dormitory,
                room_type=r.room_type,
                type=r.type,
                genders=list(r.genders),
                probability=round(probabilities[r.code], 4),
            )
            for r in rooms
            if r.code in probabilities
        ],
        notice=None if rooms else SPECIAL_CAMPUS_NOTICE.format(college=college.name),
        model=ModelInfo(mode=predictor.mode, version=predictor.version),
    )

    settings = get_settings()
    if settings.supabase_enabled and settings.log_predictions:
        background.add_task(log_prediction, body, response)
    return response

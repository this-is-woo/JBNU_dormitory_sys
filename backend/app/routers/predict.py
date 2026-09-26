from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.colleges import COLLEGES_BY_CODE
from app.config import get_settings
from app.dormitories import eligible_rooms
from app.schemas import ModelInfo, PredictRequest, PredictResponse, RoomPrediction, ScoreBreakdown
from app.services.scoring import compute_scores, get_distance
from app.services.supabase_client import log_prediction

router = APIRouter(prefix="/api/v1", tags=["predict"])

SPECIAL_CAMPUS_NOTICE = "{college} 학생은 특성화캠퍼스(익산) 생활관만 지원할 수 있어 전주캠퍼스 생활관 합격률을 계산하지 않습니다."


@router.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest, request: Request, background: BackgroundTasks) -> PredictResponse:
    """단과대학·학점·주소지·상벌점으로 환산점수를 계산하고 호실 유형별 합격 확률을 예측한다."""
    distance = get_distance(body.sigungu_code)
    if distance is None:
        raise HTTPException(status_code=422, detail="거리점수 데이터가 없는 시/군/구입니다.")

    college = COLLEGES_BY_CODE[body.college_code]
    scores = compute_scores(body.gpa, body.merit, body.demerit, distance.score)
    rooms = eligible_rooms(college.code)
    predictor = request.app.state.predictor

    probabilities = {}
    if rooms:
        probabilities = predictor.predict(
            {
                "college": college.code,
                "gpa": float(body.gpa),
                "merit": body.merit,
                "demerit": body.demerit,
                "distance_km": distance.km,
                "distance_score": float(scores.distance_score),
                "grade_score": float(scores.grade_score),
                "converted_score": float(scores.converted_score),
            }
        )

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

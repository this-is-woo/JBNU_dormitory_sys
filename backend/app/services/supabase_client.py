import logging
from functools import lru_cache

from app.config import get_settings
from app.schemas import PredictRequest, PredictResponse

logger = logging.getLogger(__name__)


@lru_cache
def get_supabase():
    """서버 전용 Supabase 클라이언트. 설정이 없으면 None."""
    settings = get_settings()
    if not settings.supabase_enabled:
        return None
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_secret_key)


def log_prediction(req: PredictRequest, res: PredictResponse) -> None:
    """예측 요청을 prediction_logs 테이블에 기록한다. 실패해도 응답에는 영향을 주지 않는다."""
    client = get_supabase()
    if client is None:
        return
    try:
        client.table("prediction_logs").insert(
            {
                "college_code": req.college_code,
                "gpa": float(req.gpa),
                "merit": req.merit,
                "demerit": req.demerit,
                "sido_code": req.sido_code,
                "sigungu_code": req.sigungu_code,
                "emd_code": req.emd_code,
                "distance_score": res.score.distance_score,
                "converted_score": res.score.converted_score,
                "predictions": {p.code: p.probability for p in res.predictions},
                "model_mode": res.model.mode,
                "model_version": res.model.version,
            }
        ).execute()
    except Exception:
        logger.exception("prediction_logs 기록에 실패했습니다.")

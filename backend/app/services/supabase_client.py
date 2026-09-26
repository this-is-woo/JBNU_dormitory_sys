import logging
import threading
import time
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
                "gender": req.gender,
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


# Supabase 무료 프로젝트는 약 1주일 동안 요청이 없으면 일시정지된다.
# UptimeRobot 이 5분마다 /health 를 부르므로, 그때 가끔(KEEPALIVE_INTERVAL 마다) DB 를 가볍게 한 번 읽어 깨워 둔다.
KEEPALIVE_INTERVAL = 6 * 60 * 60  # 초
_keepalive_lock = threading.Lock()
_last_keepalive = 0.0


def keepalive_due(now: float | None = None) -> bool:
    """지금 DB 를 깨울 차례인지. 차례면 시각을 먼저 기록해 동시에 여러 번 부르지 않게 한다."""
    global _last_keepalive
    if get_supabase() is None:
        return False
    now = time.monotonic() if now is None else now
    with _keepalive_lock:
        if _last_keepalive and now - _last_keepalive < KEEPALIVE_INTERVAL:
            return False
        _last_keepalive = now
        return True


def keepalive() -> None:
    """colleges 테이블에서 한 줄만 읽는다. 실패해도 서비스에는 영향이 없다."""
    client = get_supabase()
    if client is None:
        return
    try:
        client.table("colleges").select("code").limit(1).execute()
    except Exception:
        logger.warning("Supabase keepalive 요청이 실패했습니다.", exc_info=True)

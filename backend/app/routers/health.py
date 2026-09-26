from fastapi import APIRouter, BackgroundTasks, Request

from app.services.supabase_client import keepalive, keepalive_due

router = APIRouter(tags=["health"])


# UptimeRobot 은 기본적으로 HEAD 요청을 보내므로 GET/HEAD 를 모두 허용한다.
# Render 의 healthCheckPath 로도 사용한다.
# 6시간에 한 번은 응답을 보낸 뒤 Supabase 를 가볍게 읽어, 무료 프로젝트가 일시정지되지 않게 한다.
@router.api_route("/health", methods=["GET", "HEAD"])
def health(request: Request, background: BackgroundTasks) -> dict:
    if keepalive_due():
        background.add_task(keepalive)
    predictor = request.app.state.predictor
    return {"status": "ok", "model": {"mode": predictor.mode, "version": predictor.version}}

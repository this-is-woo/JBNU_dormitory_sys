from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


# UptimeRobot 은 기본적으로 HEAD 요청을 보내므로 GET/HEAD 를 모두 허용한다.
# Render 의 healthCheckPath 로도 사용한다.
@router.api_route("/health", methods=["GET", "HEAD"])
def health(request: Request) -> dict:
    predictor = request.app.state.predictor
    return {"status": "ok", "model": {"mode": predictor.mode, "version": predictor.version}}

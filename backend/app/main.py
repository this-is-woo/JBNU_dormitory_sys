import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import health, predict
from app.services.predictor import load_predictor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

FIELD_LABELS = {
    "collegeCode": "단과대학",
    "gpa": "학점(1.0 ~ 4.5)",
    "merit": "상점(0 ~ 99)",
    "demerit": "벌점(0 ~ 99)",
    "sidoCode": "시/도",
    "sigunguCode": "시/군/구",
    "emdCode": "읍/면/동",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 모델은 서버 시작 시 한 번만 불러온다.
    app.state.predictor = load_predictor(get_settings())
    yield


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 오류를 화면에 그대로 보여줄 수 있는 한국어 메시지로 바꾼다."""
    errors = exc.errors()
    labels = []
    for err in errors:
        loc = err.get("loc") or ("",)
        label = FIELD_LABELS.get(str(loc[-1]))
        if label and label not in labels:
            labels.append(label)
    if labels:
        message = f"입력값을 확인해 주세요: {', '.join(labels)}"
    elif errors:
        message = str(errors[0].get("msg", "")).removeprefix("Value error, ")
    else:
        message = "입력값을 확인해 주세요."
    return JSONResponse(status_code=422, content={"detail": message, "errors": jsonable_encoder(errors)})


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.allowed_origin_regex or None,
        allow_methods=["GET", "HEAD", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    app.include_router(health.router)
    app.include_router(predict.router)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {"name": settings.app_name, "docs": "/docs", "health": "/health"}

    return app


app = create_app()

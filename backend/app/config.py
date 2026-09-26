from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/


class Settings(BaseSettings):
    """환경변수 설정. 로컬은 backend/.env, Render 는 대시보드의 Environment 에서 읽는다."""

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        protected_namespaces=(),
    )

    app_name: str = "JBNU Dormitory Predictor API"

    # 쉼표로 구분한 허용 Origin (예: https://jbnu-dorm.vercel.app,http://localhost:5173)
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Vercel 프리뷰 배포처럼 패턴으로 허용할 Origin (예: https://jbnu-dorm-.*\.vercel\.app)
    allowed_origin_regex: str | None = None

    # Supabase — 서버 전용 secret(service_role) 키. 프론트엔드에 절대 노출하지 않는다.
    supabase_url: str | None = None
    supabase_secret_key: str | None = None
    # Supabase 가 설정돼 있을 때 예측 요청을 prediction_logs 테이블에 남길지
    log_predictions: bool = True

    # Colab 에서 내보낸 모델. 파일이 없으면 임시 예측기(baseline)를 사용한다.
    model_path: Path = BASE_DIR / "models" / "model.onnx"
    model_meta_path: Path = BASE_DIR / "models" / "model_meta.json"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_secret_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()

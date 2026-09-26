from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from app.colleges import COLLEGES_BY_CODE


class CamelModel(BaseModel):
    """JSON 은 camelCase(프론트엔드), 파이썬 코드는 snake_case 로 다룬다."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PredictRequest(CamelModel):
    # CamelModel 설정(alias_generator 등)과 합쳐진다
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "collegeCode": "engineering",
                "gender": "남",
                "gpa": 3.85,
                "merit": 2,
                "demerit": 0,
                "sidoCode": "11",
                "sigunguCode": "11110",
            }
        }
    )

    college_code: str = Field(description="단과대학 code (app/colleges.py)")
    # 성별마다 지원할 수 있는 호관과 합격선이 다르다. 예전 화면과의 호환을 위해 빠져도 허용한다.
    gender: Literal["남", "여"] | None = Field(default=None, description="성별 (남 / 여)")
    gpa: Decimal = Field(ge=Decimal("1.0"), le=Decimal("4.5"), decimal_places=2, description="직전 학기 평점(4.5 만점)")
    merit: int = Field(default=0, ge=0, le=99, description="상점")
    demerit: int = Field(default=0, ge=0, le=99, description="벌점")
    sido_code: str = Field(pattern=r"^\d{2}$", description="시/도 코드 (data/jbnu_distance_2026.csv)")
    sigungu_code: str = Field(pattern=r"^\d{5}$", description="시/군/구 코드 (data/jbnu_distance_2026.csv)")
    # 거리점수는 시/군/구청 기준이라 읍/면/동은 받지 않는다. 예전 화면과의 호환을 위해 보내도 허용한다.
    emd_code: str | None = Field(default=None, pattern=r"^\d{10}$", description="(사용 안 함) 읍/면/동 코드")

    @field_validator("college_code")
    @classmethod
    def check_college(cls, value: str) -> str:
        if value not in COLLEGES_BY_CODE:
            raise ValueError("알 수 없는 단과대학입니다.")
        return value

    @model_validator(mode="after")
    def check_region_hierarchy(self) -> "PredictRequest":
        if not self.sigungu_code.startswith(self.sido_code) or (
            self.emd_code is not None and not self.emd_code.startswith(self.sigungu_code)
        ):
            raise ValueError("주소지의 시/도 · 시/군/구 선택이 서로 맞지 않습니다.")
        return self


class ScoreBreakdown(CamelModel):
    grade_score: float = Field(description="성적점수 (상·벌점 반영, 90점 만점 환산)")
    distance_score: float = Field(description="거리점수 (5 ~ 10점)")
    converted_score: float = Field(description="환산점수 = 성적점수 + 거리점수")
    distance_km: float
    region_name: str


class RoomPrediction(CamelModel):
    code: str  # 예: changui_1
    name: str  # 예: 창의관 1인실
    dormitory: str
    room_type: str
    type: str  # 선발 타입 A~D
    genders: list[str]
    probability: float = Field(ge=0, le=1)


class ModelInfo(CamelModel):
    mode: Literal["model", "baseline"]
    version: str


class PredictResponse(CamelModel):
    college_name: str
    score: ScoreBreakdown
    # 지원 가능한 호실 유형만 담긴다. 특성화캠퍼스 대상 단과대학이면 비어 있고 notice 가 채워진다.
    predictions: list[RoomPrediction]
    notice: str | None = None
    model: ModelInfo

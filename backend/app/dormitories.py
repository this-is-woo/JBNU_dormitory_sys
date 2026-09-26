from dataclasses import dataclass

from app.colleges import COLLEGES_BY_CODE


@dataclass(frozen=True)
class DormRoom:
    """예측 단위: 같은 생활관이라도 호실 유형(1인실/2인실/4인실)별로 합격선이 다르다."""

    code: str  # 예: changui_1
    dormitory: str  # 생활관 이름
    room_type: str  # 1인실 / 2인실 / 4인실
    type: str  # 선발 타입 A~D
    genders: tuple[str, ...]
    # 모델 연결 전 임시 예측에만 쓰는 가상의 기준점(환산점수). 실제 합격선이 아니다.
    # 인기 순서: 창의관 1인실 > 창의관 2인실 = 한빛관 2인실 > 새빛관 2인실 > 한빛관 4인실 > 대동관 2인실 > 참빛관 2인실
    baseline_cutoff: float
    # 지원 가능한 단과대학 code. None 이면 모든 단과대학 (특성화캠퍼스 대상은 eligible_rooms 에서 제외)
    colleges: frozenset[str] | None = None

    @property
    def name(self) -> str:
        return f"{self.dormitory} {self.room_type}"

    def accepts(self, college_code: str) -> bool:
        return self.colleges is None or college_code in self.colleges


_GENERAL = frozenset(
    {
        "nursing", "business", "engineering", "agriculture", "education", "social_science",
        "human_ecology", "pharmacy", "arts", "medicine", "humanities", "natural_science",
        "dentistry", "ai", "graduate",
    }
)  # fmt: skip
_MEDICAL = frozenset({"medicine", "nursing"})

# code 는 프론트엔드(src/data/dormitories.js), Supabase dormitory_rooms 테이블,
# 모델 메타데이터(models/model_meta.json 의 "outputs")와 같아야 한다.
DORM_ROOMS: tuple[DormRoom, ...] = (
    DormRoom("changui_1", "창의관", "1인실", "D", ("남", "여"), 88.0),
    DormRoom("changui_2", "창의관", "2인실", "D", ("남", "여"), 85.0),
    DormRoom("hanbit_2", "한빛관", "2인실", "B", ("남",), 85.0, _GENERAL),
    DormRoom("saebit_2", "새빛관", "2인실", "B", ("남", "여"), 83.0, _GENERAL),
    DormRoom("hanbit_4", "한빛관", "4인실", "B", ("남",), 80.0, _GENERAL),
    DormRoom("daedong_2", "대동관", "2인실", "B", ("남",), 78.0, _GENERAL),
    DormRoom("chambit_2", "참빛관", "2인실", "A", ("남", "여"), 76.0, _GENERAL),
    DormRoom("hyemin_1", "혜민관", "1인실", "C", ("남", "여"), 84.0, _MEDICAL),
    DormRoom("hyemin_2", "혜민관", "2인실", "C", ("남", "여"), 80.0, _MEDICAL),
)

DORM_ROOM_CODES = frozenset(r.code for r in DORM_ROOMS)


def eligible_rooms(college_code: str) -> list[DormRoom]:
    """전주캠퍼스에서 해당 단과대학 학생이 지원할 수 있는 호실 유형"""
    if COLLEGES_BY_CODE[college_code].special_campus:
        return []
    return [r for r in DORM_ROOMS if r.accepts(college_code)]

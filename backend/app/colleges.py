from dataclasses import dataclass


@dataclass(frozen=True)
class College:
    code: str
    name: str
    # 특성화캠퍼스(익산) 생활관만 지원할 수 있는 단과대학
    special_campus: bool = False


# code 는 프론트엔드(src/data/colleges.js), Supabase colleges 테이블과 같아야 한다.
# 출처: 전북대학교 홈페이지 > 대학 (2026)
COLLEGES: tuple[College, ...] = (
    College("nursing", "간호대학"),
    College("business", "경상대학"),
    College("engineering", "공과대학"),
    College("agriculture", "농업생명과학대학"),
    College("education", "사범대학"),
    College("social_science", "사회과학대학"),
    College("human_ecology", "생활과학대학"),
    College("veterinary", "수의과대학", special_campus=True),
    College("pharmacy", "약학대학"),
    College("arts", "예술대학"),
    College("medicine", "의과대학"),
    College("humanities", "인문대학"),
    College("natural_science", "자연과학대학"),
    College("dentistry", "치과대학"),
    College("environment", "환경생명자원대학", special_campus=True),
    College("ai", "AI대학"),
    College("graduate", "일반대학원"),
    College("law", "법학전문대학원"),
)

COLLEGES_BY_CODE = {c.code: c for c in COLLEGES}

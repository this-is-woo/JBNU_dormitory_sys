#!/usr/bin/env python3
"""전북대 생활관 「2026학년도 선발기준 거리 데이터」로 주소지 드롭다운과 거리점수 데이터를 만든다.

입력
  data/jbnu_distance_2026.csv
    생활관 선발기준 표('26.1.1 기준)를 그대로 옮겨 적은 것 (251개 시/군/구)
    열: no, sido_code, sido, sigungu_code, sigungu, km, score
    · 드롭다운에는 이 표에 있는 시/도 → 시/군/구만 나온다. (읍/면/동 단계 없음)
    · 코드는 행정표준코드(법정동코드 앞 5자리) 체계. 표에만 있는 옛 지역명(인천 남구 등)은 옛 코드를 쓴다.

출력
  - frontend/src/data/regions.json         드롭다운 + 화면 표시용 거리점수
  - backend/app/data/distance_scores.json  서버에서 환산점수를 다시 계산할 때 사용

검증
  모든 행의 점수가 공식 거리점수 규칙 min(10, 5 + 0.25 × ⌊km / 20⌋) 과 같은지 확인하고, 다르면 멈춘다.

사용법 (저장소 루트에서)
  python scripts/build_regions.py
"""

from __future__ import annotations

import csv
import json
import math
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DISTANCE_CSV = ROOT / "data" / "jbnu_distance_2026.csv"
FRONTEND_OUT = ROOT / "frontend" / "src" / "data" / "regions.json"
BACKEND_OUT = ROOT / "backend" / "app" / "data" / "distance_scores.json"

META = {
    "distanceSource": "전북대학교 생활관 2026학년도 선발기준 거리 데이터('26.1.1 기준)",
    "distanceRule": "PC 카카오맵 길찾기 거리우선(실시간 정보 미포함), 생활관 관리동 → 학생 주소의 시·군·구청",
    "generatedAt": date.today().isoformat(),
}


def official_score(km: float) -> float:
    """20km 마다 0.25점, 20km 미만 5점, 400km 이상 10점"""
    return min(10.0, 5 + 0.25 * math.floor(km / 20))


def main() -> None:
    rows = list(csv.DictReader(DISTANCE_CSV.open(encoding="utf-8")))

    sido_names: dict[str, str] = {}
    by_sido: dict[str, list[dict]] = defaultdict(list)
    backend: dict[str, dict] = {}
    errors = []

    for row in rows:
        km = float(row["km"])
        score = float(row["score"])
        if official_score(km) != score:
            errors.append(f"{row['no']}. {row['sido']} {row['sigungu']}: {km}km → 표 {score}, 규칙 {official_score(km)}")
        if not row["sigungu_code"].startswith(row["sido_code"]):
            errors.append(f"{row['no']}. {row['sigungu']}: 시/군/구 코드가 시/도 코드로 시작하지 않음")
        if row["sigungu_code"] in backend:
            errors.append(f"{row['no']}. {row['sigungu']}: 코드 중복 {row['sigungu_code']}")

        sido_names[row["sido_code"]] = row["sido"]
        by_sido[row["sido_code"]].append(
            {"code": row["sigungu_code"], "name": row["sigungu"], "km": km, "distanceScore": score}
        )
        backend[row["sigungu_code"]] = {"sido": row["sido"], "name": row["sigungu"], "km": km, "score": score}

    if errors:
        sys.exit("거리 데이터 오류:\n  " + "\n  ".join(errors))

    frontend = {
        "meta": META,
        "sido": [{"code": code, "name": sido_names[code], "sigungu": by_sido[code]} for code in sorted(by_sido)],
    }
    FRONTEND_OUT.write_text(json.dumps(frontend, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    BACKEND_OUT.write_text(json.dumps({"meta": META, "sigungu": backend}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"시/도 {len(by_sido)}개, 시/군/구 {len(backend)}개 → {FRONTEND_OUT.name}, {BACKEND_OUT.name}")


if __name__ == "__main__":
    main()

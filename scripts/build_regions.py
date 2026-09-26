#!/usr/bin/env python3
"""행정구역(시/도 → 시/군/구 → 읍/면/동) + 전북대 생활관 거리점수 데이터를 생성한다.

입력
  1) 행정표준코드관리시스템 「법정동코드 전체자료」 (zip 또는 txt, CP949, 탭 구분)
     https://www.code.go.kr/stdcodesrch/codeAllDownloadL.do  → '법정동' 전체다운로드
  2) data/jbnu_distance_2025.csv
     전북대 생활관 FAQ 「2025학년도 선발기준 거리 데이터」('25.1.1 기준)를 옮겨 적은 표

출력
  - frontend/src/data/regions.json         드롭다운 + 화면 표시용 거리점수
  - backend/app/data/distance_scores.json  서버에서 환산점수를 다시 계산할 때 사용

사용법 (저장소 루트에서)
  python scripts/build_regions.py --download                  # code.go.kr 에서 바로 받아서 생성
  python scripts/build_regions.py --source "법정동코드 전체자료.zip"
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DISTANCE_CSV = ROOT / "data" / "jbnu_distance_2025.csv"
FRONTEND_OUT = ROOT / "frontend" / "src" / "data" / "regions.json"
BACKEND_OUT = ROOT / "backend" / "app" / "data" / "distance_scores.json"

DOWNLOAD_URL = "https://www.code.go.kr/etc/codeFullDown.do?codeseId=00002"
DOWNLOAD_REFERER = "https://www.code.go.kr/stdcodesrch/codeAllDownloadL.do"

# 2025 거리표 작성 이후 바뀐 시/도 → 거리표에서 찾아볼 옛 시/도명
SIDO_LOOKUP = {
    "전남광주통합특별시": ["광주광역시", "전라남도"],  # 2026.7.1 통합
}

# 2026.7.1 인천 행정체제 개편으로 생긴 구. 2025 거리표에 없으므로 옛 구청 기준 값을 쓴다.
ESTIMATED = {
    ("인천광역시", "제물포구"): ("인천광역시", "중구", "옛 인천 중구 거리 적용(추정)"),
    ("인천광역시", "영종구"): ("인천광역시", "중구", "옛 인천 중구 거리 적용(추정)"),
    ("인천광역시", "서해구"): ("인천광역시", "서구", "옛 인천 서구 거리 적용(추정)"),
    ("인천광역시", "검단구"): ("인천광역시", "서구", "옛 인천 서구 거리 적용(추정)"),
}


def distance_score(km: float) -> float:
    """생활관 관리동 ~ 시·군·구청 거리(km) → 거리점수. 20km마다 0.25점, 5~10점."""
    return min(10.0, 5.0 + 0.25 * math.floor(km / 20))


def load_distance_table() -> dict[tuple[str, str], dict]:
    table: dict[tuple[str, str], dict] = {}
    with DISTANCE_CSV.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            km, score = float(row["km"]), float(row["score"])
            if distance_score(km) != score:
                sys.exit(f"거리표 {row['no']}행 점수 불일치: {row} (공식 계산값 {distance_score(km)})")
            table[(row["sido"], row["sigungu"])] = {"km": km, "score": score}
    return table


def read_source(args: argparse.Namespace) -> tuple[list[tuple[str, str]], str]:
    if args.download:
        req = urllib.request.Request(
            DOWNLOAD_URL,
            data=b"codeseId=00002",
            headers={"Referer": DOWNLOAD_REFERER, "User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read()
    else:
        raw = Path(args.source).read_bytes()

    source_date = date.today().isoformat()
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            member = next(i for i in zf.infolist() if not i.is_dir())
            source_date = date(*member.date_time[:3]).isoformat()
            raw = zf.read(member)

    rows = []
    for line in raw.decode("cp949").splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) < 3 or parts[2].strip() != "존재":
            continue
        rows.append((parts[0].strip(), " ".join(parts[1].split())))
    return rows, source_date


def find_distance(table, sido_name: str, sgg_name: str) -> tuple[dict, str | None]:
    groups = SIDO_LOOKUP.get(sido_name, [sido_name])
    for g in groups:
        if (g, sgg_name) in table:
            return table[(g, sgg_name)], None
    if (sido_name, sgg_name) in ESTIMATED:
        s, g, note = ESTIMATED[(sido_name, sgg_name)]
        return table[(s, g)], note
    # 거리표가 일반구를 나누지 않은 시 (예: 부천시, 화성시)
    city = sgg_name.split(" ")[0]
    for g in groups:
        if city != sgg_name and (g, city) in table:
            return table[(g, city)], None
    raise KeyError(f"{sido_name} {sgg_name}")


def build(rows: list[tuple[str, str]], table) -> tuple[list[dict], dict[str, dict]]:
    sido = {c[:2]: n for c, n in rows if c[2:] == "00000000"}
    sgg = {c[:5]: n for c, n in rows if c[2:5] != "000" and c[5:] == "00000"}

    emd_by_sgg: dict[str, list[list[str]]] = defaultdict(list)
    for code, name in rows:
        if code[5:8] == "000" or code[8:] != "00":
            continue  # 시/도·시/군/구 행이거나 리 단위
        parent = sgg[code[:5]]
        short = name[len(parent) + 1:] if name.startswith(parent + " ") else name.split(" ")[-1]
        emd_by_sgg[code[:5]].append([code, short])

    # 세종특별자치시는 원본에 시/도 행 없이 시/군/구 행(3611000000)만 있다
    for code, name in sgg.items():
        sido.setdefault(code[:2], name.split(" ")[0])

    sido_list, backend_map, missing = [], {}, []
    for sd_code, sd_name in sorted(sido.items()):
        sigungu = []
        for sg_code, full in sgg.items():
            # 일반구를 둔 시(예: 전주시)는 읍/면/동이 구 아래에 있으므로 목록에서 빠진다
            if sg_code[:2] != sd_code or sg_code not in emd_by_sgg:
                continue
            name = full[len(sd_name) + 1:] if full.startswith(sd_name + " ") else ""
            try:
                dist, note = find_distance(table, sd_name, name)
            except KeyError as e:
                missing.append(str(e))
                continue
            item = {
                "code": sg_code,
                "name": name or sd_name,
                "km": dist["km"],
                "distanceScore": dist["score"],
                "emd": sorted(emd_by_sgg[sg_code], key=lambda x: x[1]),
            }
            if note:
                item["note"] = note
            sigungu.append(item)
            backend_map[sg_code] = {
                "sido": sd_name,
                "name": item["name"],
                "km": dist["km"],
                "score": dist["score"],
                **({"note": note} if note else {}),
            }
        if sigungu:
            sigungu.sort(key=lambda x: x["name"])
            sido_list.append({"code": sd_code, "name": sd_name, "sigungu": sigungu})

    if missing:
        sys.exit("거리점수를 찾지 못한 시/군/구가 있습니다. data/jbnu_distance_2025.csv 또는 "
                 "ESTIMATED 를 보완하세요:\n  " + "\n  ".join(missing))
    return sido_list, backend_map


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--source", help="법정동코드 전체자료 zip/txt 경로")
    src.add_argument("--download", action="store_true", help="code.go.kr 에서 직접 내려받기")
    args = parser.parse_args()

    table = load_distance_table()
    rows, source_date = read_source(args)
    sido_list, backend_map = build(rows, table)

    meta = {
        "regionSource": "행정표준코드관리시스템 법정동코드 전체자료",
        "regionSourceDate": source_date,
        "distanceSource": "전북대학교 생활관 2025학년도 선발기준 거리 데이터('25.1.1 기준)",
        "generatedAt": date.today().isoformat(),
    }
    FRONTEND_OUT.parent.mkdir(parents=True, exist_ok=True)
    BACKEND_OUT.parent.mkdir(parents=True, exist_ok=True)
    FRONTEND_OUT.write_text(
        json.dumps({"meta": meta, "sido": sido_list}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    BACKEND_OUT.write_text(
        json.dumps({"meta": meta, "sigungu": backend_map}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    n_sgg = sum(len(s["sigungu"]) for s in sido_list)
    n_emd = sum(len(g["emd"]) for s in sido_list for g in s["sigungu"])
    print(f"시/도 {len(sido_list)} · 시/군/구 {n_sgg} · 읍/면/동 {n_emd} (원본 {source_date})")
    print(f"→ {FRONTEND_OUT.relative_to(ROOT)}\n→ {BACKEND_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

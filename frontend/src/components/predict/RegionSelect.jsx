import { koCompare } from '../../data/colleges.js'

const byName = (a, b) => koCompare(a.name, b.name)

/**
 * 시/도 → 시/군/구 연쇄 드롭다운. 목록은 「2026학년도 선발기준 거리 데이터」에 있는 지역만 (data/jbnu_distance_2026.csv).
 * 거리점수가 시·군·구청 기준이라 읍/면/동은 고르지 않는다.
 * 시/도를 고르기 전에는 시/군/구가 비활성화되고, 시/도를 바꾸면 시/군/구 선택은 초기화된다.
 */
export default function RegionSelect({ regions, value, onChange }) {
  const sido = regions?.sido.find((s) => s.code === value.sidoCode)

  return (
    <div className="region-select">
      <select
        className={`select${value.sidoCode ? '' : ' is-empty'}`}
        aria-label="시/도"
        value={value.sidoCode}
        disabled={!regions}
        onChange={(e) => onChange({ sidoCode: e.target.value, sigunguCode: '' })}
      >
        <option value="" hidden>
          시/도
        </option>
        {regions?.sido.toSorted(byName).map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        className={`select${value.sigunguCode ? '' : ' is-empty'}`}
        aria-label="시/군/구"
        value={value.sigunguCode}
        disabled={!sido}
        onChange={(e) => onChange({ sigunguCode: e.target.value })}
      >
        <option value="" hidden>
          시/군/구
        </option>
        {sido?.sigungu.toSorted(byName).map((g) => (
          <option key={g.code} value={g.code}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  )
}

import { koCompare } from '../../data/colleges.js'

const byName = (a, b) => koCompare(a.name, b.name)

/**
 * 시/도 → 시/군/구 → 읍/면/동 연쇄 드롭다운.
 * 상위 단계를 고르기 전에는 하위 단계가 비활성화되고, 상위 단계를 바꾸면 하위 선택은 초기화된다.
 */
export default function RegionSelect({ regions, value, onChange }) {
  const sido = regions?.sido.find((s) => s.code === value.sidoCode)
  const sigungu = sido?.sigungu.find((g) => g.code === value.sigunguCode)

  return (
    <div className="region-select">
      <select
        className={`select${value.sidoCode ? '' : ' is-empty'}`}
        aria-label="시/도"
        value={value.sidoCode}
        disabled={!regions}
        onChange={(e) => onChange({ sidoCode: e.target.value, sigunguCode: '', emdCode: '' })}
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
        onChange={(e) => onChange({ sigunguCode: e.target.value, emdCode: '' })}
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

      <select
        className={`select${value.emdCode ? '' : ' is-empty'}`}
        aria-label="읍/면/동"
        value={value.emdCode}
        disabled={!sigungu}
        onChange={(e) => onChange({ emdCode: e.target.value })}
      >
        <option value="" hidden>
          읍/면/동
        </option>
        {sigungu?.emd.toSorted((a, b) => koCompare(a[1], b[1])).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}

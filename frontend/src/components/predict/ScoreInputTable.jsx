import { COLLEGES_SORTED } from '../../data/colleges.js'
import { formatScore, isGpaInputAllowed, isPointInputAllowed, normalizePoint } from '../../lib/score.js'
import { IconMapPin } from '../common/Icons.jsx'
import NumericInput from './NumericInput.jsx'
import RegionSelect from './RegionSelect.jsx'
import './ScoreInputTable.css'

/**
 * 단과대학 · 성별 · 학점 · 주소지 · 상점 · 벌점 입력 + 환산점수 결과 열
 * @param {object} props.form       { collegeCode, gender, gpa, merit, demerit, sidoCode, sigunguCode } (문자열)
 * @param {object|null} props.college    선택된 단과대학
 * @param {object|null} props.sigungu    선택된 시/군/구 (거리점수 포함)
 * @param {object|null} props.breakdown  { gradeScore, distanceScore, convertedScore }
 */
export default function ScoreInputTable({ form, onChange, regions, college, sigungu, breakdown }) {
  return (
    <div className="table-card">
      <table className="score-table">
        <caption className="sr-only">생활관 선발 점수 입력표</caption>
        <colgroup>
          <col className="col-college" />
          <col className="col-gender" />
          <col className="col-gpa" />
          <col className="col-region" />
          <col className="col-point" />
          <col className="col-point" />
          <col className="col-score" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              단과대학
            </th>
            <th scope="col">
              성별
            </th>
            <th scope="col">
              학점
            </th>
            <th scope="col">
              주소지
            </th>
            <th scope="col">
              상점
            </th>
            <th scope="col">
              벌점
            </th>
            <th scope="col" className="is-result">
              환산점수
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="단과대학">
              <select
                className={`select${form.collegeCode ? '' : ' is-empty'}`}
                aria-label="단과대학"
                value={form.collegeCode}
                onChange={(e) => onChange({ collegeCode: e.target.value })}
              >
                <option value="" hidden>
                  단과대학
                </option>
                {COLLEGES_SORTED.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              {college?.specialCampus && <p className="cell-note is-warning">특성화캠퍼스(익산) 생활관 대상</p>}
            </td>
            <td data-label="성별">
              <select
                className={`select${form.gender ? '' : ' is-empty'}`}
                aria-label="성별"
                value={form.gender}
                onChange={(e) => onChange({ gender: e.target.value })}
              >
                <option value="" hidden>
                  성별
                </option>
                <option value="남">남자</option>
                <option value="여">여자</option>
              </select>
            </td>
            <td data-label="학점">
              <NumericInput
                id="gpa"
                inputMode="decimal"
                placeholder="1.0 ~ 4.5"
                aria-label="직전 학기 학점"
                value={form.gpa}
                onChange={(gpa) => onChange({ gpa })}
                isAllowed={isGpaInputAllowed}
                warning="1.0 ~ 4.5 사이, 소수 둘째 자리까지 입력할 수 있어요."
              />
            </td>
            <td data-label="주소지">
              <RegionSelect regions={regions} value={form} onChange={onChange} />
              {sigungu && (
                <p className="cell-note">
                  <IconMapPin width={14} height={14} />
                  거리점수 <strong className="tabular">{formatScore(sigungu.distanceScore)}</strong>점
                  <span className="tabular">· 약 {sigungu.km}km</span>
                </p>
              )}
            </td>
            <td data-label="상점">
              <NumericInput
                id="merit"
                inputMode="numeric"
                placeholder="0"
                aria-label="상점"
                value={form.merit}
                onChange={(merit) => onChange({ merit })}
                isAllowed={isPointInputAllowed}
                normalize={normalizePoint}
                warning="0 ~ 99 사이의 정수만 입력할 수 있어요."
              />
            </td>
            <td data-label="벌점">
              <NumericInput
                id="demerit"
                inputMode="numeric"
                placeholder="0"
                aria-label="벌점"
                value={form.demerit}
                onChange={(demerit) => onChange({ demerit })}
                isAllowed={isPointInputAllowed}
                normalize={normalizePoint}
                warning="0 ~ 99 사이의 정수만 입력할 수 있어요."
              />
            </td>
            <td data-label="환산점수" className="is-result">
              <output className="score-output tabular" htmlFor="gpa merit demerit" aria-live="polite">
                {breakdown ? formatScore(breakdown.convertedScore) : '—'}
              </output>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { COLLEGES, findCollege, koCompare } from '../../data/colleges.js'
import { fetchGpaStats } from '../../lib/admin.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert, IconInfo } from '../common/Icons.jsx'
import GpaRangeChart, { SMALL_SAMPLE } from './GpaRangeChart.jsx'
import StatTile from './StatTile.jsx'
import { formatCount, formatGpa, formatGpaRange } from './adminFormat.js'

const PERIODS = [
  { value: null, label: '전체 기간' },
  { value: 90, label: '최근 90일' },
  { value: 30, label: '최근 30일' },
  { value: 7, label: '최근 7일' },
]
const GENDERS = [
  { value: null, label: '남녀 전체' },
  { value: '남', label: '남자' },
  { value: '여', label: '여자' },
]
// 같은 IP 에서 반복해 남긴 기록 (supabase/migrations/20261018000000_score_client_key.sql)
const COUNTING = [
  { value: false, label: '모든 기록' },
  { value: true, label: '같은 IP 는 최근 1건만' },
]
const SORTS = [
  { value: 'mean', label: '평균 높은 순' },
  { value: 'count', label: '기록 많은 순' },
  { value: 'name', label: '이름순' },
]

const byName = (a, b) => koCompare(a.name, b.name)
const isSparse = (r) => r.n < SMALL_SAMPLE

function sortRows(rows, sort) {
  if (sort === 'name') return [...rows].sort(byName)
  if (sort === 'count') return [...rows].sort((a, b) => b.n - a.n || byName(a, b))
  // 평균순: 기록이 적은 단과대학은 값이 흔들리므로 뒤로 보낸다
  return [...rows].sort((a, b) => Number(isSparse(a)) - Number(isSparse(b)) || b.mean - a.mean || byName(a, b))
}

function StatsTable({ overall, rows }) {
  const cells = (s) => (
    <>
      <td className="is-num tabular">{formatCount(s.n)}</td>
      <td className="is-num tabular">{formatGpa(s.mean)}</td>
      <td className="is-num tabular">{formatGpa(s.median)}</td>
      <td className="is-num tabular">{formatGpa(s.q1)}</td>
      <td className="is-num tabular">{formatGpa(s.q3)}</td>
      <td className="is-num tabular">{formatGpa(s.min)}</td>
      <td className="is-num tabular">{formatGpa(s.max)}</td>
    </>
  )
  return (
    <details className="adm-table-toggle">
      <summary>표로 보기</summary>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <caption className="adm-table-caption">
            하위 25% · 상위 25%는 학점 순으로 줄 세웠을 때 아래에서 · 위에서 4분의 1 지점이에요.
          </caption>
          <thead>
            <tr>
              <th scope="col">단과대학</th>
              <th scope="col" className="is-num">
                기록
              </th>
              <th scope="col" className="is-num">
                평균
              </th>
              <th scope="col" className="is-num">
                중앙값
              </th>
              <th scope="col" className="is-num">
                하위 25%
              </th>
              <th scope="col" className="is-num">
                상위 25%
              </th>
              <th scope="col" className="is-num">
                최저
              </th>
              <th scope="col" className="is-num">
                최고
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="is-total">
              <th scope="row">전체</th>
              {cells(overall)}
            </tr>
            {rows.map((r) => (
              <tr key={r.code}>
                <th scope="row">{r.name}</th>
                {cells(r)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export default function AdminGpaStats() {
  const [days, setDays] = useState(null)
  const [gender, setGender] = useState(null)
  const [onePerClient, setOnePerClient] = useState(false)
  const [sort, setSort] = useState('mean')
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true }))
    fetchGpaStats({ days, gender, onePerClient })
      .then((data) => active && setState({ status: 'ready', data, loading: false }))
      .catch((err) => active && setState({ status: 'error', message: err.message }))
    return () => {
      active = false
    }
  }, [days, gender, onePerClient])

  const data = state.data
  const rows = useMemo(
    () => sortRows((data?.colleges ?? []).map((c) => ({ ...c, name: findCollege(c.code)?.name ?? c.code })), sort),
    [data, sort],
  )
  const missing = useMemo(
    () => COLLEGES.filter((c) => !rows.some((r) => r.code === c.code)).sort(byName),
    [rows],
  )
  const filtered = days != null || gender != null || onePerClient

  return (
    <section className="adm-panel" aria-labelledby="adm-gpa-title">
      <div className="adm-panel-head">
        <h2 id="adm-gpa-title">학점 통계</h2>
        <p>
          홈 계산기에서 환산점수가 계산될 때 남는 기록(기록 탭의 점수 계산)으로 단과대학별 학점을 모았어요. 누가
          입력했는지는 알 수 없어서, 같은 사람이 여러 번 계산하면 여러 건으로 세요. ‘같은 IP 는 최근 1건만’을 고르면 같은
          IP 에서 반복한 기록은 가장 최근 것만 세요 (IP 를 알 수 없는 예전 기록은 모두 세요).
        </p>
      </div>

      <div className="adm-gpa-filters">
        <ChoiceGroup label="기간" options={PERIODS} value={days} onChange={setDays} size="sm" />
        <ChoiceGroup label="성별" options={GENDERS} value={gender} onChange={setGender} size="sm" />
        <ChoiceGroup label="같은 IP 기록" options={COUNTING} value={onePerClient} onChange={setOnePerClient} size="sm" />
      </div>

      {state.status === 'error' && (
        <div className="notice notice-danger" role="alert">
          <IconAlert width={18} height={18} />
          <p>{state.message}</p>
        </div>
      )}
      {state.status === 'loading' && <p className="adm-empty">불러오는 중…</p>}

      {state.status === 'ready' && (
        <div className={`adm-gpa${state.loading ? ' is-loading' : ''}`}>
          {gender && data.noGender > 0 && (
            <div className="notice">
              <IconInfo width={18} height={18} />
              <p>
                성별을 함께 저장하기 전의 기록 {formatCount(data.noGender)}건은 남녀를 나눌 수 없어 빠졌어요. ‘남녀 전체’에서는
                셀 수 있어요.
              </p>
            </div>
          )}

          {data.total === 0 ? (
            <p className="adm-empty">{filtered ? '이 조건에 맞는 기록이 없어요.' : '아직 점수 계산 기록이 없어요.'}</p>
          ) : (
            <>
              <div className="adm-stats-row">
                <StatTile
                  label="기록"
                  value={data.total}
                  sub={
                    [
                      onePerClient && data.repeatExcluded > 0 && `같은 IP 반복 ${formatCount(data.repeatExcluded)}건 뺌`,
                      !gender && data.noGender > 0 && `성별 없는 예전 기록 ${formatCount(data.noGender)}건 포함`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '홈에서 환산점수가 계산된 횟수'
                  }
                />
                <StatTile label="평균 학점" value={formatGpa(data.overall.mean)} sub={`중앙값 ${formatGpa(data.overall.median)}`} />
                <StatTile
                  label="가운데 50%"
                  value={formatGpaRange(data.overall.q1, data.overall.q3)}
                  sub="학점 순으로 줄 세운 가운데 절반"
                />
                <StatTile label="최저 ~ 최고" value={formatGpaRange(data.overall.min, data.overall.max)} sub="4.5 만점" />
              </div>

              <section className="adm-section" aria-labelledby="adm-gpa-colleges-title">
                <div className="adm-section-head">
                  <h3 id="adm-gpa-colleges-title">단과대학별</h3>
                  <ChoiceGroup label="정렬" options={SORTS} value={sort} onChange={setSort} size="sm" />
                </div>
                <GpaRangeChart rows={rows} labelledBy="adm-gpa-colleges-title" />
                {(rows.some(isSparse) || missing.length > 0) && (
                  <div className="adm-gpa-foot">
                    {rows.some(isSparse) && (
                      <p>기록이 {SMALL_SAMPLE}건보다 적은 단과대학은 값이 크게 흔들릴 수 있어 흐리게 표시했어요.</p>
                    )}
                    {missing.length > 0 && (
                      <p>
                        기록이 없는 단과대학 {missing.length}곳: {missing.map((c) => c.name).join(', ')}
                      </p>
                    )}
                  </div>
                )}
                <StatsTable overall={data.overall} rows={rows} />
              </section>
            </>
          )}
        </div>
      )}
    </section>
  )
}

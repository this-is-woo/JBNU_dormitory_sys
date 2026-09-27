import { useEffect, useState } from 'react'
import { fetchActivity } from '../../lib/admin.js'
import { IconAlert } from '../common/Icons.jsx'
import StatTile from './StatTile.jsx'
import TrendChart, { dayLabel } from './TrendChart.jsx'
import { ACTION_LABEL, formatCount, formatKst } from './adminFormat.js'

const TRENDS = [
  { key: 'scores', title: '점수 계산' },
  { key: 'predictions', title: '합격률 예측 요청' },
  { key: 'posts', title: '새 룸메이트 글' },
  { key: 'requests', title: '룸메 신청' },
]

export default function AdminOverview({ overview, onGo }) {
  const [logs, setLogs] = useState(null)

  useEffect(() => {
    let active = true
    fetchActivity('admin', 1)
      .then((res) => active && setLogs(res.items.slice(0, 6)))
      .catch(() => active && setLogs([]))
    return () => {
      active = false
    }
  }, [])

  if (overview.status === 'error') {
    return (
      <div className="notice notice-danger" role="alert">
        <IconAlert width={18} height={18} />
        <p>{overview.message}</p>
      </div>
    )
  }
  if (overview.status !== 'ready') return <p className="adm-empty">불러오는 중…</p>
  const o = overview.data

  return (
    <div className={`adm-overview${overview.loading ? ' is-loading' : ''}`}>
      <section aria-labelledby="adm-kpi-title">
        <h2 id="adm-kpi-title" className="sr-only">
          지금 상황
        </h2>
        <div className="adm-stats-row">
          <StatTile
            label="처리 대기 신고"
            value={o.reportsPending}
            sub={`전체 신고 ${formatCount(o.reports)}건`}
            flag={o.reportsPending > 0 ? '확인 필요' : null}
            onClick={() => onGo('reports')}
          />
          <StatTile
            label="모집 중인 글"
            value={o.postsOpen}
            sub={`전체 ${formatCount(o.posts)} · 모집완료 ${formatCount(o.postsClosed)} · 숨김 ${formatCount(o.postsHidden)}`}
            onClick={() => onGo('posts', { status: 'open' })}
          />
          <StatTile label="룸메 신청" value={o.requests} sub={`오늘 ${formatCount(o.requestsToday)}건 · 차단 ${formatCount(o.blocks)}건`} />
          <StatTile label="사용자" value={o.users} sub={`체크리스트 등록 ${formatCount(o.profiles)}명`} onClick={() => onGo('users')} />
          <StatTile label="이용 정지 중" value={o.suspended} sub="지금 정지된 사용자" onClick={() => onGo('users', { status: 'suspended' })} />
          <StatTile
            label="오늘 점수 계산"
            value={o.scoresToday}
            sub={`전체 ${formatCount(o.scores)}건`}
            onClick={() => onGo('activity', { status: 'scores' })}
          />
          <StatTile
            label="오늘 예측 요청"
            value={o.predictionsToday}
            sub={`전체 ${formatCount(o.predictions)}건`}
            onClick={() => onGo('activity', { status: 'predictions' })}
          />
          <StatTile
            label="합격 결과 제보"
            value={o.admissionReports}
            sub={`학습 제외 ${formatCount(o.admissionExcluded)}건`}
            onClick={() => onGo('admissions')}
          />
        </div>
      </section>

      <section className="adm-section" aria-labelledby="adm-trend-title">
        <div className="adm-section-head">
          <h2 id="adm-trend-title">최근 14일</h2>
          <p>하루 단위 (한국 시간). 지표마다 눈금이 달라요.</p>
        </div>
        <div className="adm-trends">
          {TRENDS.map((t) => (
            <TrendChart key={t.key} title={t.title} data={o.daily.map((d) => ({ day: d.day, value: d[t.key] }))} />
          ))}
        </div>
        <details className="adm-table-toggle">
          <summary>표로 보기</summary>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">날짜</th>
                  {TRENDS.map((t) => (
                    <th key={t.key} scope="col" className="is-num">
                      {t.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...o.daily].reverse().map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{dayLabel(d.day)}</th>
                    {TRENDS.map((t) => (
                      <td key={t.key} className="is-num tabular">
                        {formatCount(d[t.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="adm-section" aria-labelledby="adm-recent-title">
        <div className="adm-section-head">
          <h2 id="adm-recent-title">최근 관리 기록</h2>
          <button type="button" className="adm-link" onClick={() => onGo('activity', { status: 'admin' })}>
            모두 보기
          </button>
        </div>
        {logs === null ? (
          <p className="adm-empty">불러오는 중…</p>
        ) : logs.length === 0 ? (
          <p className="adm-empty">아직 관리 기록이 없어요.</p>
        ) : (
          <ul className="adm-log-list">
            {logs.map((log) => (
              <li key={log.id}>
                <span className="tabular">{formatKst(log.created_at)}</span>
                <strong>{ACTION_LABEL[log.action] ?? log.action}</strong>
                <span className="adm-muted">{log.detail?.author ?? log.detail?.email ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

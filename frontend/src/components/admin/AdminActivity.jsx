import { useEffect, useState } from 'react'
import { ADMIN_PAGE_SIZE, fetchActivity } from '../../lib/admin.js'
import { isSupabaseConfigured } from '../../config.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert } from '../common/Icons.jsx'
import Pagination from '../common/Pagination.jsx'
import { collegeName, dormName } from '../roommates/postFormat.js'
import { semesterLabel } from '../../lib/semester.js'
import { ACTION_LABEL, formatCount, formatKst, suspendedUntilLabel } from './adminFormat.js'

const KINDS = [
  { value: 'admin', label: '관리 기록' },
  { value: 'scores', label: '점수 계산' },
  { value: 'predictions', label: '예측 요청' },
]

const KIND_NOTE = {
  admin: '관리자 페이지에서 한 일이 모두 남아요.',
  scores:
    '홈에서 단과대학·성별·학점·주소지를 모두 입력해 환산점수가 계산될 때 익명으로 남는 기록이에요 (누가 입력했는지는 남지 않아요). 성별을 함께 저장하기 전의 기록은 성별이 “—”로 보여요. IP 키는 IP 주소를 알아볼 수 없게 바꾼 값이라, 같은 키면 같은 IP 에서 남긴 기록이에요. 키를 누르면 그 키의 기록만 보여요.',
  predictions: '합격률 예측 요청마다 백엔드가 남기는 기록이에요.',
}

// changui_1 → 창의관 1인실
const roomName = (code) => {
  const [dorm, size] = String(code).split('_')
  return size ? `${dormName(dorm)} ${size}인실` : dormName(dorm)
}

const SETTING_LABEL = { support_enabled: '후원 메뉴', roommate_semester: '룸메이트 모집 학기' }

function logTarget(item) {
  const d = item.detail ?? {}
  if (item.target_type === 'setting') return SETTING_LABEL[item.target_id] ?? item.target_id
  return d.author ?? d.email ?? (item.target_id ? `${item.target_type} ${String(item.target_id).slice(0, 8)}` : '—')
}

function logDetail(item) {
  const d = item.detail ?? {}
  const parts = []
  if (item.action === 'suspend_user') parts.push(suspendedUntilLabel(d.until))
  if (item.action === 'set_roommate_semester') parts.push(semesterLabel(d.value))
  if (d.dormitory) parts.push(dormName(d.dormitory))
  if (d.content) parts.push(`“${d.content.length > 60 ? `${d.content.slice(0, 60)}…` : d.content}”`)
  if (d.note) parts.push(`메모: ${d.note}`)
  return parts.join(' · ') || '—'
}

function topRooms(predictions) {
  return Object.entries(predictions ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([code, p]) => `${roomName(code)} ${Math.round(p * 100)}%`)
    .join(', ')
}

/** 같은 IP 키 표시: 키(누르면 그 키만 보기) + 그 키의 기록 수 (2건 이상이면 강조) */
function ClientKey({ item, active, onPick }) {
  if (!item.client_key) return <span className="adm-muted">—</span>
  const count = Number(item.client_count ?? 0)
  return (
    <span className="adm-client">
      <button
        type="button"
        className={`adm-client-key tabular${active ? ' is-active' : ''}`}
        onClick={() => onPick(item.client_key)}
        title="이 IP 키의 기록만 보기"
      >
        {item.client_key}
      </button>
      {count > 1 && (
        <span className={`adm-client-count tabular${count >= 5 ? ' is-many' : ''}`} title={`같은 IP 에서 남긴 기록 ${count}건`}>
          ×{formatCount(count)}
        </span>
      )}
    </span>
  )
}

function ActivityTable({ kind, items, client, onClient }) {
  if (kind === 'admin') {
    return (
      <table className="adm-table">
        <thead>
          <tr>
            <th scope="col">시각</th>
            <th scope="col">한 일</th>
            <th scope="col">대상</th>
            <th scope="col">내용</th>
            <th scope="col">관리자</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="tabular">{formatKst(item.created_at)}</td>
              <td>{ACTION_LABEL[item.action] ?? item.action}</td>
              <td className="adm-cell-wrap">{logTarget(item)}</td>
              <td className="adm-cell-wrap">{logDetail(item)}</td>
              <td className="adm-cell-wrap">{item.admin_email ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (kind === 'scores') {
    return (
      <table className="adm-table">
        <thead>
          <tr>
            <th scope="col">시각</th>
            <th scope="col">단과대학</th>
            <th scope="col">성별</th>
            <th scope="col" className="is-num">학점</th>
            <th scope="col" className="is-num">거리점수</th>
            <th scope="col" className="is-num">환산점수</th>
            <th scope="col">IP 키</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="tabular">{formatKst(item.created_at)}</td>
              <td>{collegeName(item.college_code) || item.college_code}</td>
              <td>{item.gender ?? '—'}</td>
              <td className="is-num tabular">{Number(item.gpa).toFixed(2)}</td>
              <td className="is-num tabular">{Number(item.distance_score).toFixed(2)}</td>
              <td className="is-num tabular">{Number(item.converted_score).toFixed(2)}</td>
              <td>
                <ClientKey item={item} active={item.client_key === client} onPick={onClient} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th scope="col">시각</th>
          <th scope="col">단과대학</th>
          <th scope="col">성별</th>
          <th scope="col" className="is-num">학점</th>
          <th scope="col" className="is-num">상·벌점</th>
          <th scope="col" className="is-num">환산점수</th>
          <th scope="col">가장 높은 호실</th>
          <th scope="col">모델</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className="tabular">{formatKst(item.created_at)}</td>
            <td>{collegeName(item.college_code) || item.college_code}</td>
            <td>{item.gender ?? '—'}</td>
            <td className="is-num tabular">{Number(item.gpa).toFixed(2)}</td>
            <td className="is-num tabular">
              +{item.merit} / −{item.demerit}
            </td>
            <td className="is-num tabular">{Number(item.converted_score).toFixed(2)}</td>
            <td className="adm-cell-wrap">{topRooms(item.predictions) || '—'}</td>
            <td>{item.model_mode === 'model' ? item.model_version ?? '모델' : '임시 기준점'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AdminActivity({ initial }) {
  const [kind, setKind] = useState(KINDS.some((k) => k.value === initial.status) ? initial.status : 'admin')
  const [page, setPage] = useState(1)
  // 점수 계산 기록: 이 IP 키의 기록만 (null 이면 전체)
  const [client, setClient] = useState(null)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 })

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true }))
    fetchActivity(kind, page, kind === 'scores' ? client : null)
      .then((res) => active && setState({ status: 'ready', ...res, loading: false }))
      .catch((err) => active && setState({ status: 'error', items: [], total: 0, message: err.message }))
    return () => {
      active = false
    }
  }, [kind, page, client])

  const pickClient = (key) => {
    setClient((c) => (c === key ? null : key))
    setPage(1)
  }

  const pageCount = Math.max(1, Math.ceil(state.total / ADMIN_PAGE_SIZE))
  // 데모에서도 점수 계산은 이 브라우저에 남지만, 예측 요청은 백엔드가 서버에만 남긴다
  const demoEmpty = !isSupabaseConfigured && kind === 'predictions'

  return (
    <section className="adm-panel" aria-labelledby="adm-activity-title">
      <div className="adm-panel-head">
        <h2 id="adm-activity-title">기록</h2>
        <p>{KIND_NOTE[kind]} 시각은 모두 한국 시간이에요.</p>
      </div>

      <div className="adm-filters">
        <ChoiceGroup
          label="기록 종류"
          options={KINDS}
          value={kind}
          onChange={(v) => {
            setKind(v)
            setPage(1)
            setClient(null)
          }}
          size="sm"
        />
      </div>

      <div className="adm-result-bar">
        <p aria-live="polite">
          {state.status === 'ready' && (
            <>
              <strong className="tabular">{formatCount(state.total)}</strong>건
            </>
          )}
        </p>
        {kind === 'scores' && client && (
          <p className="adm-client-filter">
            IP 키 <code className="tabular">{client}</code>의 기록만 보는 중
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => pickClient(client)}>
              전체 보기
            </button>
          </p>
        )}
      </div>

      {state.status === 'error' && (
        <div className="notice notice-danger" role="alert">
          <IconAlert width={18} height={18} />
          <p>{state.message}</p>
        </div>
      )}
      {state.status === 'loading' && <p className="adm-empty">불러오는 중…</p>}
      {state.status === 'ready' && !state.items.length && (
        <p className="adm-empty">{demoEmpty ? '데모 모드에서는 이 기록이 서버에만 쌓여서 비어 있어요.' : '아직 기록이 없어요.'}</p>
      )}
      {state.items.length > 0 && (
        <div className={`adm-table-wrap${state.loading ? ' is-loading' : ''}`}>
          <ActivityTable kind={kind} items={state.items} client={client} onClient={pickClient} />
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
    </section>
  )
}

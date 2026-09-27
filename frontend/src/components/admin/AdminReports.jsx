import { useEffect, useState } from 'react'
import { ADMIN_PAGE_SIZE, fetchAdminReports, updateAdminPost, updateAdminReport } from '../../lib/admin.js'
import { semesterLabel } from '../../lib/semester.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert } from '../common/Icons.jsx'
import Pagination from '../common/Pagination.jsx'
import { collegeName, dormName, genderLabel } from '../roommates/postFormat.js'
import NoteEditor from './NoteEditor.jsx'
import SuspendModal from './SuspendModal.jsx'
import {
  POST_STATE_LABEL,
  REPORT_STATUS_FILTERS,
  REPORT_STATUS_LABEL,
  formatCount,
  asText,
  formatKst,
  reasonLabel,
  suspendedUntilLabel,
} from './adminFormat.js'

const STATUS_CHIP = { pending: 'chip-warning', reviewed: 'chip-success', dismissed: '' }

function Snapshot({ report }) {
  // 신고 당시 내용은 모양을 보장할 수 없어(예전에는 지어낸 내용도 들어올 수 있었다) 모두 글자로 바꿔 보여 준다
  const raw = report.snapshot && typeof report.snapshot === 'object' ? report.snapshot : {}
  const s = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, asText(v)]))
  if (report.targetType === 'request') {
    return (
      <div className="adm-snapshot">
        <span className="adm-snapshot-label">신고 당시 신청</span>
        <p>
          <b>신청 한마디</b> {s.message || '없음'}
        </p>
        {s.reply && (
          <p>
            <b>글쓴이 답장</b> {s.reply}
          </p>
        )}
      </div>
    )
  }
  const facts = [
    s.dormitory && dormName(s.dormitory),
    s.semester && semesterLabel(s.semester),
    s.collegeCode && collegeName(s.collegeCode),
    s.age && `${s.age}세`,
    s.gender && genderLabel(s.gender),
    s.mbti,
  ].filter(Boolean)
  return (
    <div className="adm-snapshot">
      <span className="adm-snapshot-label">신고 당시 글</span>
      {facts.length > 0 && <p className="adm-snapshot-facts">{facts.join(' · ')}</p>}
      <p className="adm-content">{s.content || '자기소개 없음'}</p>
    </div>
  )
}

function ReportCard({ report, busy, onAction }) {
  const act = (action) => () => onAction(action, report)
  const isPost = report.targetType === 'post'
  const postAlive = report.postState && report.postState !== 'deleted'
  return (
    <article className="adm-card" aria-busy={busy}>
      <header className="adm-card-head">
        <div className="adm-card-title">
          <strong>{reasonLabel(report.reason)}</strong>
          <span>
            {isPost ? '게시글 신고' : '받은 신청 신고'} · {formatKst(report.createdAt)}
          </span>
        </div>
        <div className="adm-badges">
          <span className={`chip ${STATUS_CHIP[report.status]}`}>{REPORT_STATUS_LABEL[report.status]}</span>
          {isPost && report.postState && (
            <span className={`chip${report.postState === 'hidden' || report.postState === 'deleted' ? ' chip-danger' : ''}`}>
              글 {POST_STATE_LABEL[report.postState]}
            </span>
          )}
          {!isPost && !report.requestExists && <span className="chip">신청 삭제됨</span>}
        </div>
      </header>

      <dl className="adm-people">
        <div>
          <dt>신고한 사람</dt>
          <dd>{report.reporterEmail ?? '(탈퇴한 사용자)'}</dd>
        </div>
        <div>
          <dt>신고받은 사람</dt>
          <dd>
            <button type="button" className="adm-link" onClick={act('user')}>
              {report.reportedEmail ?? '(탈퇴한 사용자)'}
            </button>
            <span className="adm-muted"> · 받은 신고 {report.reportedTotal}회</span>
            {report.reportedSuspended && (
              <span className="chip chip-danger">정지 {suspendedUntilLabel(report.reportedSuspendedUntil)}</span>
            )}
          </dd>
        </div>
      </dl>

      {report.detail && (
        <blockquote className="adm-quote">
          <span>신고 내용</span>
          {report.detail}
        </blockquote>
      )}

      <Snapshot report={report} />

      <NoteEditor value={report.adminNote} onSave={(note) => onAction('note', report, note)} />

      <footer className="adm-actions">
        {report.status === 'pending' ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={act('reviewed')} disabled={busy}>
              처리 완료
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={act('dismissed')} disabled={busy}>
              기각
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={act('pending')} disabled={busy}>
            대기로 되돌리기
          </button>
        )}
        {isPost && postAlive && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={act('viewPost')}>
              글 보기
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={act('togglePost')} disabled={busy}>
              {report.postState === 'hidden' ? '글 다시 보이기' : '글 숨기기'}
            </button>
          </>
        )}
        <button type="button" className="btn btn-ghost btn-sm adm-danger-text" onClick={act('suspend')} disabled={busy || !report.reportedId}>
          {report.reportedSuspended ? '정지 관리' : '신고받은 사람 정지'}
        </button>
      </footer>
    </article>
  )
}

export default function AdminReports({ notify, onChanged, onOpenPost, onOpenUser }) {
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 })
  const [busyId, setBusyId] = useState(null)
  const [suspendTarget, setSuspendTarget] = useState(null)

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true }))
    fetchAdminReports({ status, page })
      .then((res) => {
        if (!active) return
        if (!res.items.length && page > 1) return setPage((p) => p - 1)
        setState({ status: 'ready', ...res, loading: false })
      })
      .catch((err) => active && setState({ status: 'error', items: [], total: 0, message: err.message }))
    return () => {
      active = false
    }
  }, [status, page, reloadKey])

  const refresh = () => {
    setReloadKey((k) => k + 1)
    onChanged()
  }

  async function run(report, task, message) {
    setBusyId(report.id)
    try {
      await task()
      notify(message)
      refresh()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleAction(action, report, note) {
    if (action === 'note') {
      await updateAdminReport(report.id, { note })
      notify('메모를 저장했어요.')
      return refresh()
    }
    if (action === 'user') return onOpenUser(report.reportedEmail ?? report.reportedId)
    if (action === 'viewPost') return onOpenPost(report.postId)
    if (action === 'suspend') {
      return setSuspendTarget({
        userId: report.reportedId,
        email: report.reportedEmail,
        isSuspended: report.reportedSuspended,
        suspendedUntil: report.reportedSuspendedUntil,
      })
    }
    if (action === 'togglePost') {
      const hide = report.postState !== 'hidden'
      return run(report, () => updateAdminPost(report.postId, { isOpen: !hide }), hide ? '신고된 글을 숨겼어요.' : '글을 다시 보이게 했어요.')
    }
    if (['reviewed', 'dismissed', 'pending'].includes(action)) {
      const label = { reviewed: '처리 완료로', dismissed: '기각으로', pending: '처리 대기로' }[action]
      return run(report, () => updateAdminReport(report.id, { status: action }), `신고를 ${label} 바꿨어요.`)
    }
  }

  const pageCount = Math.max(1, Math.ceil(state.total / ADMIN_PAGE_SIZE))

  return (
    <section className="adm-panel" aria-labelledby="adm-reports-title">
      <div className="adm-panel-head">
        <h2 id="adm-reports-title">신고</h2>
        <p>신고 사실은 상대에게 알리지 않아요. 글이 지워져도 신고 당시 내용은 남아 있어요.</p>
      </div>

      <div className="adm-filters">
        <ChoiceGroup
          label="처리 상태"
          options={REPORT_STATUS_FILTERS}
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
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
      </div>

      {state.status === 'error' && (
        <div className="notice notice-danger" role="alert">
          <IconAlert width={18} height={18} />
          <p>{state.message}</p>
        </div>
      )}
      {state.status === 'loading' && <p className="adm-empty">불러오는 중…</p>}
      {state.status === 'ready' && !state.items.length && (
        <p className="adm-empty">{status === 'pending' ? '처리할 신고가 없어요.' : '해당하는 신고가 없어요.'}</p>
      )}
      {state.items.length > 0 && (
        <div className={`adm-grid${state.loading ? ' is-loading' : ''}`}>
          {state.items.map((report) => (
            <ReportCard key={report.id} report={report} busy={busyId === report.id} onAction={handleAction} />
          ))}
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <SuspendModal
        key={`suspend-${suspendTarget?.userId ?? 'none'}`}
        target={suspendTarget}
        onClose={() => setSuspendTarget(null)}
        onDone={(message) => {
          setSuspendTarget(null)
          notify(message)
          refresh()
        }}
      />
    </section>
  )
}

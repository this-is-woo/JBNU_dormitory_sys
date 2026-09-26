import { useEffect, useState } from 'react'
import { APPLY_ROOMS, GRADES, RESULTS, findApplyRoom, semesterLabel, semesterOptions } from '../../data/reportOptions.js'
import { ADMIN_PAGE_SIZE, fetchAdminAdmissions, updateAdminAdmission } from '../../lib/admin.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert } from '../common/Icons.jsx'
import Pagination from '../common/Pagination.jsx'
import { collegeName, dormName, genderLabel } from '../roommates/postFormat.js'
import NoteEditor from './NoteEditor.jsx'
import { formatCount, formatKst } from './adminFormat.js'

const RESULT_FILTERS = [{ value: null, label: '모든 결과' }, ...RESULTS.map(({ value, label }) => ({ value, label }))]
const EXCLUDED_FILTERS = [
  { value: null, label: '전체' },
  { value: false, label: '학습에 쓰는 제보' },
  { value: true, label: '학습 제외' },
]
const RESULT_CHIP = { accepted: 'chip-success', waitlist: 'chip-primary', rejected: '' }

const resultLabel = (value) => RESULTS.find((r) => r.value === value)?.label ?? value
const gradeLabel = (value) => GRADES.find((g) => g.value === value)?.label ?? value
const roomLabel = (code) => findApplyRoom(code)?.label ?? code

function AdmissionCard({ report, busy, onAction }) {
  return (
    <article className={`adm-card${report.isExcluded ? ' is-hidden' : ''}`} aria-busy={busy}>
      <header className="adm-card-head">
        <div className="adm-card-title">
          <strong>
            {roomLabel(report.appliedRoom)}
            {report.assignedDormitory && <span> → {dormName(report.assignedDormitory)} 배정</span>}
          </strong>
          <span>{semesterLabel(report.semester)}</span>
        </div>
        <div className="adm-badges">
          <span className={`chip ${RESULT_CHIP[report.result]}`}>{resultLabel(report.result)}</span>
          {report.isExcluded && <span className="chip chip-danger">학습 제외</span>}
        </div>
      </header>

      <dl className="adm-stats">
        <div>
          <dt>환산점수</dt>
          <dd className="tabular">{report.convertedScore.toFixed(2)}</dd>
        </div>
        <div>
          <dt>성별</dt>
          <dd>{genderLabel(report.gender)}</dd>
        </div>
        <div>
          <dt>단과대학</dt>
          <dd>{collegeName(report.collegeCode)}</dd>
        </div>
        <div>
          <dt>학년</dt>
          <dd>{gradeLabel(report.grade)}</dd>
        </div>
      </dl>

      <p className="adm-author">
        <span>{report.email ?? '(탈퇴한 사용자)'}</span>
        <span>
          · 제보 {formatKst(report.createdAt)}
          {report.updatedAt && ` · 수정 ${formatKst(report.updatedAt)}`}
        </span>
      </p>

      <NoteEditor value={report.adminNote} onSave={(note) => onAction('note', report, note)} />

      <footer className="adm-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAction('toggle', report)} disabled={busy}>
          {report.isExcluded ? '학습에 다시 포함' : '학습에서 제외'}
        </button>
      </footer>
    </article>
  )
}

export default function AdminAdmissions({ notify, onChanged }) {
  const [filters, setFilters] = useState({ semester: null, room: null, result: null, excluded: null })
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 })
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true }))
    fetchAdminAdmissions({ ...filters, page })
      .then((res) => {
        if (!active) return
        if (!res.items.length && page > 1) return setPage((p) => p - 1)
        setState({ status: 'ready', ...res, loading: false })
      })
      .catch((err) => active && setState({ status: 'error', items: [], total: 0, message: err.message }))
    return () => {
      active = false
    }
  }, [filters, page, reloadKey])

  const setFilter = (patch) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }
  const refresh = () => {
    setReloadKey((k) => k + 1)
    onChanged()
  }

  async function handleAction(action, report, note) {
    if (action === 'note') {
      await updateAdminAdmission(report.id, { note })
      notify('메모를 저장했어요.')
      return refresh()
    }
    setBusyId(report.id)
    try {
      await updateAdminAdmission(report.id, { excluded: !report.isExcluded })
      notify(report.isExcluded ? '학습 데이터에 다시 넣었어요.' : '학습 데이터에서 뺐어요.')
      refresh()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const pageCount = Math.max(1, Math.ceil(state.total / ADMIN_PAGE_SIZE))

  return (
    <section className="adm-panel" aria-labelledby="adm-admissions-title">
      <div className="adm-panel-head">
        <h2 id="adm-admissions-title">합격 결과 제보</h2>
        <p>이상한 값은 지우지 말고 [학습에서 제외]로 표시하세요. 학습용 보기(admission_reports_training)에서 빠져요.</p>
      </div>

      <div className="adm-filters">
        <ChoiceGroup label="결과" options={RESULT_FILTERS} value={filters.result} onChange={(result) => setFilter({ result })} size="sm" />
        <ChoiceGroup
          label="학습 사용 여부"
          options={EXCLUDED_FILTERS}
          value={filters.excluded}
          onChange={(excluded) => setFilter({ excluded })}
          size="sm"
        />
        <div className="adm-filter-row">
          <select
            className={`select${filters.semester ? '' : ' is-empty'}`}
            aria-label="학기"
            value={filters.semester ?? ''}
            onChange={(e) => setFilter({ semester: e.target.value || null })}
          >
            <option value="">모든 학기</option>
            {semesterOptions().map((s) => (
              <option key={s} value={s}>
                {semesterLabel(s)}
              </option>
            ))}
          </select>
          <select
            className={`select${filters.room ? '' : ' is-empty'}`}
            aria-label="지원한 호실"
            value={filters.room ?? ''}
            onChange={(e) => setFilter({ room: e.target.value || null })}
          >
            <option value="">모든 호실</option>
            {APPLY_ROOMS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
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
      {state.status === 'ready' && !state.items.length && <p className="adm-empty">조건에 맞는 제보가 없어요.</p>}
      {state.items.length > 0 && (
        <div className={`adm-grid${state.loading ? ' is-loading' : ''}`}>
          {state.items.map((report) => (
            <AdmissionCard key={report.id} report={report} busy={busyId === report.id} onAction={handleAction} />
          ))}
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
    </section>
  )
}

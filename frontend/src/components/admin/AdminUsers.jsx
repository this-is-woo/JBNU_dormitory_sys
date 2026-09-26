import { useEffect, useState } from 'react'
import { ADMIN_PAGE_SIZE, fetchAdminUsers, moderateUser } from '../../lib/admin.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert } from '../common/Icons.jsx'
import Pagination from '../common/Pagination.jsx'
import NoteEditor from './NoteEditor.jsx'
import SearchBox from './SearchBox.jsx'
import SuspendModal from './SuspendModal.jsx'
import { USER_FILTERS, formatCount, formatKst, suspendedUntilLabel } from './adminFormat.js'

function UserCard({ user, onAction }) {
  const act = (action) => () => onAction(action, user)
  return (
    <article className="adm-card adm-user">
      <header className="adm-card-head">
        <div className="adm-card-title">
          <strong className="adm-email">{user.email ?? user.id}</strong>
          <span>
            가입 {formatKst(user.createdAt)} · 최근 로그인 {formatKst(user.lastSignInAt)}
          </span>
        </div>
        <div className="adm-badges">
          {user.isAdmin && <span className="chip chip-primary">관리자</span>}
          {user.isSuspended && <span className="chip chip-danger">정지 {suspendedUntilLabel(user.suspendedUntil)}</span>}
          {user.hasProfile ? <span className="chip">체크리스트 등록</span> : <span className="chip">체크리스트 없음</span>}
        </div>
      </header>

      <dl className="adm-stats">
        <div>
          <dt>쓴 글</dt>
          <dd className="tabular">{user.postCount}</dd>
        </div>
        <div>
          <dt>보낸 신청</dt>
          <dd className="tabular">{user.requestCount}</dd>
        </div>
        <div>
          <dt>받은 신고</dt>
          <dd className="tabular">
            {user.reportedCount}
            {user.pendingReportedCount > 0 && <small> (대기 {user.pendingReportedCount})</small>}
          </dd>
        </div>
        <div>
          <dt>한 신고</dt>
          <dd className="tabular">{user.filedCount}</dd>
        </div>
      </dl>

      <NoteEditor value={user.note} onSave={(note) => onAction('note', user, note)} />

      <footer className="adm-actions">
        {user.postCount > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={act('posts')}>
            글 보기
          </button>
        )}
        {!user.isAdmin && (
          <button type="button" className="btn btn-ghost btn-sm adm-danger-text" onClick={act('suspend')}>
            {user.isSuspended ? '정지 관리' : '이용 정지'}
          </button>
        )}
      </footer>
    </article>
  )
}

export default function AdminUsers({ initial, notify, onChanged, onOpenPosts }) {
  const [filter, setFilter] = useState(initial.status ?? null)
  const [search, setSearch] = useState(initial.search ?? '')
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 })
  const [suspendTarget, setSuspendTarget] = useState(null)

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true }))
    fetchAdminUsers({ filter, search, page })
      .then((res) => {
        if (!active) return
        if (!res.items.length && page > 1) return setPage((p) => p - 1)
        setState({ status: 'ready', ...res, loading: false })
      })
      .catch((err) => active && setState({ status: 'error', items: [], total: 0, message: err.message }))
    return () => {
      active = false
    }
  }, [filter, search, page, reloadKey])

  const refresh = () => {
    setReloadKey((k) => k + 1)
    onChanged()
  }

  async function handleAction(action, user, note) {
    if (action === 'posts') return onOpenPosts(user.email ?? user.id)
    if (action === 'note') {
      await moderateUser(user.id, { note })
      notify('메모를 저장했어요.')
      return refresh()
    }
    if (action === 'suspend') {
      return setSuspendTarget({
        userId: user.id,
        email: user.email,
        isSuspended: user.isSuspended,
        suspendedUntil: user.suspendedUntil,
        note: user.note,
      })
    }
  }

  const pageCount = Math.max(1, Math.ceil(state.total / ADMIN_PAGE_SIZE))

  return (
    <section className="adm-panel" aria-labelledby="adm-users-title">
      <div className="adm-panel-head">
        <h2 id="adm-users-title">사용자</h2>
        <p>구글 계정으로 로그인한 모든 사용자예요. 이메일은 관리자에게만 보여요.</p>
      </div>

      <div className="adm-filters">
        <ChoiceGroup
          label="사용자 종류"
          options={USER_FILTERS}
          value={filter}
          onChange={(v) => {
            setFilter(v)
            setPage(1)
          }}
          size="sm"
        />
        <div className="adm-filter-row">
          <SearchBox
            key={search}
            initial={search}
            placeholder="이메일 · 계정 id"
            onSearch={(q) => {
              setSearch(q)
              setPage(1)
            }}
          />
        </div>
      </div>

      <div className="adm-result-bar">
        <p aria-live="polite">
          {state.status === 'ready' && (
            <>
              <strong className="tabular">{formatCount(state.total)}</strong>명
              {search && (
                <>
                  {' '}
                  · “{search}” 검색 결과{' '}
                  <button type="button" className="adm-link" onClick={() => setSearch('')}>
                    검색 지우기
                  </button>
                </>
              )}
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
      {state.status === 'ready' && !state.items.length && <p className="adm-empty">조건에 맞는 사용자가 없어요.</p>}
      {state.items.length > 0 && (
        <div className={`adm-grid${state.loading ? ' is-loading' : ''}`}>
          {state.items.map((user) => (
            <UserCard key={user.id} user={user} onAction={handleAction} />
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

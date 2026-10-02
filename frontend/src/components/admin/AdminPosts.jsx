import { useEffect, useState } from 'react'
import { DORMITORIES } from '../../data/dormitories.js'
import { ADMIN_PAGE_SIZE, deleteAdminPost, fetchAdminPosts, updateAdminPost } from '../../lib/admin.js'
import { browsableSemesters, semesterLabel } from '../../lib/semester.js'
import ChoiceGroup from '../common/ChoiceGroup.jsx'
import { IconAlert } from '../common/Icons.jsx'
import Modal from '../common/Modal.jsx'
import Pagination from '../common/Pagination.jsx'
import ChecklistView from '../roommates/ChecklistView.jsx'
import { collegeName, dormName, genderLabel } from '../roommates/postFormat.js'
import ConfirmModal from './ConfirmModal.jsx'
import SearchBox from './SearchBox.jsx'
import SuspendModal from './SuspendModal.jsx'
import { POST_STATUS_FILTERS, formatCount, formatKst, suspendedUntilLabel } from './adminFormat.js'

const LONG_CONTENT = 140

function PostContent({ text }) {
  const [open, setOpen] = useState(false)
  if (!text) return <p className="adm-content is-empty">한마디 없음</p>
  const long = text.length > LONG_CONTENT || text.split('\n').length > 4
  return (
    <div>
      <p className={`adm-content${long && !open ? ' is-clamped' : ''}`}>{text}</p>
      {long && (
        <button type="button" className="adm-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? '접기' : '더보기'}
        </button>
      )}
    </div>
  )
}

function PostCard({ post, busy, onAction }) {
  const act = (action) => () => onAction(action, post)
  return (
    <article className={`adm-card${post.isOpen ? '' : ' is-hidden'}`} aria-busy={busy}>
      <header className="adm-card-head">
        <div className="adm-card-title">
          <strong>
            {dormName(post.dormitory)}
            {post.semester && <span> · {semesterLabel(post.semester)} 입주</span>}
          </strong>
          <span>
            {collegeName(post.collegeCode)} · {post.age}세 · {genderLabel(post.gender)} · {post.mbti ?? 'MBTI 비공개'}
          </span>
        </div>
        <div className="adm-badges">
          {!post.isOpen && <span className="chip chip-danger">숨김</span>}
          {post.isClosed ? <span className="chip">모집완료</span> : post.isOpen && <span className="chip chip-success">모집 중</span>}
          {post.pendingReports > 0 && <span className="chip chip-warning">신고 대기 {post.pendingReports}</span>}
          {post.authorSuspended && <span className="chip chip-danger">작성자 정지</span>}
          {post.isSample && <span className="chip">예시</span>}
        </div>
      </header>

      <p className="adm-author">
        <button type="button" className="adm-link" onClick={act('author')} title="이 사용자의 글만 보기">
          {post.authorEmail ?? '(알 수 없음)'}
        </button>
        <span>글 {post.authorPostCount}개</span>
        {post.authorSuspended && <span>· 정지 {suspendedUntilLabel(post.authorSuspendedUntil)}</span>}
      </p>

      <PostContent text={post.content} />

      <dl className="adm-meta">
        <div>
          <dt>작성</dt>
          <dd>{formatKst(post.createdAt)}</dd>
        </div>
        {post.updatedAt && (
          <div>
            <dt>수정</dt>
            <dd>{formatKst(post.updatedAt)}</dd>
          </div>
        )}
        <div>
          <dt>받은 신청</dt>
          <dd className="tabular">{post.requestCount}</dd>
        </div>
        <div>
          <dt>신고</dt>
          <dd className="tabular">
            {post.reportCount}
            {post.pendingReports > 0 && ` (대기 ${post.pendingReports})`}
          </dd>
        </div>
      </dl>

      <footer className="adm-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={act('detail')}>
          체크리스트
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={act('toggleClosed')} disabled={busy}>
          {post.isClosed ? '다시 모집' : '모집완료'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={act('toggleOpen')} disabled={busy}>
          {post.isOpen ? '숨기기' : '다시 보이기'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm adm-danger-text" onClick={act('suspend')} disabled={busy}>
          {post.authorSuspended ? '작성자 정지 관리' : '작성자 정지'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm adm-danger-text" onClick={act('delete')} disabled={busy}>
          삭제
        </button>
      </footer>
    </article>
  )
}

function PostDetailModal({ post, onClose }) {
  return (
    <Modal
      open={Boolean(post)}
      onClose={onClose}
      size="lg"
      title={post ? `${dormName(post.dormitory)} 룸메이트 글` : ''}
      subtitle={post && `${post.authorEmail ?? ''} · ${formatKst(post.createdAt)}`}
    >
      {post && (
        <div className="post-detail">
          <div className="post-detail-summary">
            <div>
              <span>단과대학</span>
              <strong>{collegeName(post.collegeCode)}</strong>
            </div>
            <div>
              <span>나이 · 성별</span>
              <strong>
                {post.age}세 · {genderLabel(post.gender)}
              </strong>
            </div>
            <div>
              <span>MBTI</span>
              <strong>{post.mbti ?? '비공개'}</strong>
            </div>
          </div>
          {post.content && <p className="post-detail-content">{post.content}</p>}
          <ChecklistView checklist={post.checklist} />
        </div>
      )}
    </Modal>
  )
}

const selectValue = (v) => v ?? ''

/**
 * 룸메이트 게시글 관리: 숨긴 글·정지된 사용자의 글까지 모든 카드를 보고 제어한다.
 * initial: URL 에서 넘어온 { search, status } (다른 탭에서 "글 보기"로 온 경우)
 */
export default function AdminPosts({ initial, notify, onChanged, onOpenUser }) {
  const [filters, setFilters] = useState({
    status: initial.status ?? null,
    semester: null,
    dormitory: null,
    gender: null,
    search: initial.search ?? '',
  })
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0 })
  const [busyId, setBusyId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [suspendTarget, setSuspendTarget] = useState(null)

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true }))
    fetchAdminPosts({ ...filters, page })
      .then((res) => {
        if (!active) return
        // 마지막 쪽의 글을 모두 지워 쪽 범위를 벗어난 경우
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

  async function run(post, task, message) {
    setBusyId(post.id)
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

  function handleAction(action, post) {
    if (action === 'detail') return setDetail(post)
    if (action === 'author') return setFilter({ search: post.authorEmail ?? post.authorId, status: null })
    if (action === 'delete') return setDeleting(post)
    if (action === 'suspend') {
      return setSuspendTarget({
        userId: post.authorId,
        email: post.authorEmail,
        isSuspended: post.authorSuspended,
        suspendedUntil: post.authorSuspendedUntil,
      })
    }
    if (action === 'toggleOpen') {
      return run(
        post,
        () => updateAdminPost(post.id, { isOpen: !post.isOpen }),
        post.isOpen ? '글을 숨겼어요. 글쓴이에게만 보여요.' : '글을 다시 보이게 했어요.',
      )
    }
    if (action === 'toggleClosed') {
      return run(
        post,
        () => updateAdminPost(post.id, { isClosed: !post.isClosed }),
        post.isClosed ? '다시 모집 중으로 바꿨어요.' : '모집완료로 바꿨어요.',
      )
    }
  }

  async function confirmDelete(post) {
    await deleteAdminPost(post.id)
    setDeleting(null)
    notify('글을 삭제했어요.')
    refresh()
  }

  const pageCount = Math.max(1, Math.ceil(state.total / ADMIN_PAGE_SIZE))
  const searching = Boolean(filters.search)

  return (
    <section className="adm-panel" aria-labelledby="adm-posts-title">
      <div className="adm-panel-head">
        <h2 id="adm-posts-title">룸메이트 게시글</h2>
        <p>숨긴 글과 정지된 사용자의 글까지 모두 보여요. 숨긴 글은 글쓴이에게만 보이고 신청·신고를 받을 수 없어요.</p>
      </div>

      <div className="adm-filters">
        <ChoiceGroup label="상태" options={POST_STATUS_FILTERS} value={filters.status} onChange={(status) => setFilter({ status })} size="sm" />
        <div className="adm-filter-row">
          <select
            className={`select${filters.semester ? '' : ' is-empty'}`}
            aria-label="학기"
            value={selectValue(filters.semester)}
            onChange={(e) => setFilter({ semester: e.target.value || null })}
          >
            <option value="">모든 학기</option>
            {browsableSemesters().map((s) => (
              <option key={s} value={s}>
                {semesterLabel(s)}
              </option>
            ))}
          </select>
          <select
            className={`select${filters.dormitory ? '' : ' is-empty'}`}
            aria-label="호관"
            value={selectValue(filters.dormitory)}
            onChange={(e) => setFilter({ dormitory: e.target.value || null })}
          >
            <option value="">모든 호관</option>
            {DORMITORIES.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            className={`select${filters.gender ? '' : ' is-empty'}`}
            aria-label="성별"
            value={selectValue(filters.gender)}
            onChange={(e) => setFilter({ gender: e.target.value || null })}
          >
            <option value="">모든 성별</option>
            <option value="남">남자</option>
            <option value="여">여자</option>
          </select>
          <SearchBox
            key={filters.search}
            initial={filters.search}
            placeholder="내용 · 작성자 이메일 · 글 id"
            onSearch={(search) => setFilter({ search })}
          />
        </div>
      </div>

      <div className="adm-result-bar">
        <p aria-live="polite">
          {state.status === 'ready' && (
            <>
              <strong className="tabular">{formatCount(state.total)}</strong>개
              {searching && (
                <>
                  {' '}
                  · “{filters.search}” 검색 결과{' '}
                  <button type="button" className="adm-link" onClick={() => setFilter({ search: '' })}>
                    검색 지우기
                  </button>
                </>
              )}
            </>
          )}
        </p>
        {searching && state.items[0] && state.items.every((p) => p.authorId === state.items[0].authorId) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenUser(state.items[0].authorEmail ?? state.items[0].authorId)}>
            이 사용자 관리
          </button>
        )}
      </div>

      {state.status === 'error' && (
        <div className="notice notice-danger" role="alert">
          <IconAlert width={18} height={18} />
          <p>{state.message}</p>
        </div>
      )}
      {state.status === 'loading' && <p className="adm-empty">불러오는 중…</p>}
      {state.status === 'ready' && !state.items.length && <p className="adm-empty">조건에 맞는 글이 없어요.</p>}
      {state.items.length > 0 && (
        <div className={`adm-grid${state.loading ? ' is-loading' : ''}`}>
          {state.items.map((post) => (
            <PostCard key={post.id} post={post} busy={busyId === post.id} onAction={handleAction} />
          ))}
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      <PostDetailModal post={detail} onClose={() => setDetail(null)} />
      <ConfirmModal
        key={`delete-${deleting?.id ?? 'none'}`}
        target={deleting}
        title="이 글을 삭제할까요?"
        subtitle={deleting && `${deleting.authorEmail ?? ''} · ${dormName(deleting.dormitory)}`}
        confirmLabel="삭제하기"
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      >
        <ul className="rq-block-effects">
          <li>삭제한 글은 되돌릴 수 없어요. 잠시 가리기만 하려면 [숨기기]를 쓰세요.</li>
          <li>이 글로 시작된 채팅(받은 신청 {deleting?.requestCount ?? 0}건)은 지워지지 않고 두 사람 사이에 남아요.</li>
          <li>신고 기록은 신고 당시 내용과 함께 남고, 관리 기록에 글의 요약이 남아요.</li>
        </ul>
      </ConfirmModal>
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

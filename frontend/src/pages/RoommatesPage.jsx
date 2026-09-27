import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import LoginModal from '../components/auth/LoginModal.jsx'
import ChoiceGroup from '../components/common/ChoiceGroup.jsx'
import { IconAlert, IconInfo } from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import Pagination from '../components/common/Pagination.jsx'
import BoardGate from '../components/roommates/BoardGate.jsx'
import DeletePostModal from '../components/roommates/DeletePostModal.jsx'
import MyPostsModal from '../components/roommates/MyPostsModal.jsx'
import PostDetailModal from '../components/roommates/PostDetailModal.jsx'
import { matchCount } from '../components/roommates/postFormat.js'
import ProfileForm from '../components/roommates/ProfileForm.jsx'
import BlockConfirmModal from '../components/roommates/BlockConfirmModal.jsx'
import ReportModal from '../components/roommates/ReportModal.jsx'
import RequestsInboxModal from '../components/roommates/RequestsInboxModal.jsx'
import RequestConfirmModal from '../components/roommates/RequestConfirmModal.jsx'
import RoommateCard from '../components/roommates/RoommateCard.jsx'
import RoommateForm from '../components/roommates/RoommateForm.jsx'
import { DORMITORIES } from '../data/dormitories.js'
import { GENDERS } from '../data/roommateOptions.js'
import { useAdmin } from '../hooks/useAdmin.js'
import { authMode } from '../hooks/useAuth.js'
import { recallAfterLogin, rememberAfterLogin } from '../lib/afterLogin.js'
import { fetchMyProfile, profileFields, saveProfile } from '../lib/roommateProfile.js'
import { fetchMyStatus, reportPost } from '../lib/roommateReports.js'
import { blockAuthor, cancelRequest, fetchInboxCounts, fetchSentPostIds, sendRequest } from '../lib/roommateRequests.js'
import { browsableSemesters, semesterLabel } from '../lib/semester.js'
import {
  PAGE_SIZE,
  SAMPLE_POSTS,
  createRoommatePost,
  deleteRoommatePost,
  fetchRoommatePage,
  roommateStorage,
  updateRoommatePost,
} from '../lib/roommates.js'
import './RoommatesPage.css'

const ALL = 'all'
const withAll = (options) => [{ value: ALL, label: '전체' }, ...options]
const INITIAL_FILTERS = { semester: ALL, dormitory: ALL, gender: ALL }
const SEMESTER_OPTIONS = browsableSemesters().map((s) => ({ value: s, label: semesterLabel(s) }))

// 로그인·체크리스트 등록 뒤에 이어서 할 일 ('write' | 'myPosts' | 'unlock' | 'requests' | 'profile')
// 구글 로그인 페이지로 이동했다 돌아오는 경우를 위해 sessionStorage 에도 남긴다.
const AFTER_LOGIN_KEY = 'jbnu-dorm:after-login'
const LOGIN_REASONS = {
  write: '글을 쓰려면 로그인이 필요해요.',
  myPosts: '내가 쓴 글을 보려면 로그인이 필요해요.',
  requests: '신청 내역을 보려면 로그인이 필요해요.',
  profile: '내 정보를 보려면 로그인이 필요해요.',
  unlock: '로그인하고 체크리스트를 등록하면 글을 볼 수 있어요.',
}
const NEEDS_PROFILE = ['write', 'unlock', 'requests']

const readAfterLogin = () => recallAfterLogin(AFTER_LOGIN_KEY)
const writeAfterLogin = (action) => rememberAfterLogin(AFTER_LOGIN_KEY, action)

function AccountBar({ status, user, hasProfile, onLogin, onLogout, onProfile }) {
  if (status === 'loading') return <span className="rm-account-placeholder" aria-hidden="true" />
  if (status !== 'signedIn') {
    return (
      <button type="button" className="btn btn-ghost rm-login" onClick={onLogin}>
        로그인
      </button>
    )
  }
  return (
    <div className="rm-account-wrap">
      {hasProfile && (
        <button type="button" className="btn btn-ghost rm-login" onClick={onProfile}>
          내 정보
        </button>
      )}
      <div className="rm-account">
        <span className="rm-account-dot" aria-hidden="true" />
        <span className="rm-account-email" title={user.email}>
          {user.email}
        </span>
        {authMode === 'demo' && <span className="chip">데모</span>}
        <button type="button" className="rm-account-signout" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </div>
  )
}

export default function RoommatesPage() {
  const { status: authStatus, user, signIn, signInWithIdToken, signOut, isAdmin } = useAdmin()
  // 내 정보(프로필). status: 'idle'(로그인 전) | 'loading' | 'ready' | 'error'(불러오지 못함)
  const [profile, setProfile] = useState({ status: 'idle', data: null })
  const [profileRetry, setProfileRetry] = useState(0)
  // 지금 페이지의 글만 들고 있는다. status: 'loading'(처음) | 'ready' | 'error', loading: 페이지 넘기는 중
  const [board, setBoard] = useState({ status: 'loading', items: [], total: 0, loading: true })
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const feedRef = useRef(null)
  // null: 닫힘 / { post: null }: 새 글 / { post }: 수정
  const [editor, setEditor] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [myPostsOpen, setMyPostsOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  // 신청 내역 창. null: 닫힘 / { tab }: 전체 / { postId }: 그 글에 온 신청만
  const [inbox, setInbox] = useState(null)
  // 글쓴이 차단 확인 창 (게시글)
  const [blockPost, setBlockPost] = useState(null)
  // 카드의 [삭제]로 지우려는 내 글
  const [deletingPost, setDeletingPost] = useState(null)
  // 신고 창 (게시글)
  const [reportTarget, setReportTarget] = useState(null)
  // 운영자가 이용을 정지한 계정인지
  const [suspension, setSuspension] = useState({ suspended: false, until: null })
  // 모바일에서 필터 펼침
  const [filtersOpen, setFiltersOpen] = useState(false)
  // 룸메 신청 확인 창. { post, mode: 'send' | 'cancel' }
  const [confirm, setConfirm] = useState(null)
  const [sentIds, setSentIds] = useState(() => new Set())
  const [counts, setCounts] = useState({ requests: 0, replies: 0 })
  const [loginOpen, setLoginOpen] = useState(false)
  const [pending, setPending] = useState(() => readAfterLogin())

  const location = useLocation()
  const navigate = useNavigate()
  const signedIn = authStatus === 'signedIn'
  const unlocked = signedIn && Boolean(profile.data)
  const gateStage =
    signedIn && profile.status === 'error'
      ? 'error'
      : authStatus === 'loading' || (signedIn && profile.status !== 'ready')
        ? 'loading'
        : !signedIn
          ? 'signedOut'
          : 'noProfile'

  // 로그인하면 내 정보를 불러온다
  useEffect(() => {
    if (!signedIn) {
      setProfile({ status: 'idle', data: null })
      return
    }
    let active = true
    setProfile({ status: 'loading', data: null })
    fetchMyProfile(user.id)
      .then((data) => active && setProfile({ status: 'ready', data }))
      // 불러오지 못한 것을 "체크리스트 없음"으로 보면, 등록 창이 떠서 이미 있는 체크리스트를 다시 만들려다 실패한다
      .catch(() => active && setProfile({ status: 'error', data: null }))
    return () => {
      active = false
    }
  }, [signedIn, user?.id, profileRetry]) // eslint-disable-line react-hooks/exhaustive-deps

  // 게시판은 체크리스트를 등록한 뒤에만 불러온다 (DB 도 그 전에는 글을 내주지 않는다)
  useEffect(() => {
    if (!unlocked) return
    let active = true
    setBoard((b) => ({ ...b, loading: true }))
    fetchRoommatePage({
      userId: user?.id,
      page,
      semester: filters.semester === ALL ? null : filters.semester,
      dormitory: filters.dormitory === ALL ? null : filters.dormitory,
      gender: filters.gender === ALL ? null : filters.gender,
    })
      .then(({ items, total, outOfRange }) => {
        if (!active) return
        // 마지막 페이지의 글이 모두 지워졌으면 앞 페이지로
        if (page > 1 && (outOfRange || items.length === 0)) return setPage((p) => p - 1)
        setBoard({ status: 'ready', items, total, loading: false })
      })
      .catch(() => active && setBoard((b) => ({ ...b, status: 'error', loading: false })))
    return () => {
      active = false
    }
  }, [unlocked, user?.id, page, filters.semester, filters.dormitory, filters.gender, reloadKey])

  // 로그인과 체크리스트 확인이 끝나면, 누르려던 버튼의 동작을 이어서 한다
  useEffect(() => {
    if (!pending || !signedIn || profile.status !== 'ready') return
    setLoginOpen(false)
    if (NEEDS_PROFILE.includes(pending) && !profile.data) {
      setProfileOpen(true)
      return
    }
    finishPending(pending)
  }, [pending, signedIn, profile.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // 모바일 메뉴의 바로가기(내 정보·내가 쓴 글·신청 내역·로그인)로 들어온 경우
  useEffect(() => {
    const action = location.state?.action
    if (!action || authStatus === 'loading') return
    navigate(location.pathname, { replace: true, state: null })
    requireAccess(action)
  }, [location.key, authStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  function finishPending(action) {
    writeAfterLogin(null)
    setPending(null)
    if (action === 'profile') setProfileOpen(true)
    if (action === 'write') setEditor({ post: null })
    if (action === 'myPosts') setMyPostsOpen(true)
    if (action === 'requests') setInbox({ tab: counts.replies > 0 && !counts.requests ? 'sent' : 'received' })
  }

  // 새 신청·답장 수(툴바 배지)와 내가 신청한 글. 주기적으로 확인하지 않고,
  // 게시판을 열 때와 다른 탭에 갔다가 돌아올 때만 불러온다 (서버 요청 절약)
  async function refreshRequests() {
    if (!unlocked) {
      setCounts({ requests: 0, replies: 0 })
      setSentIds(new Set())
      return
    }
    try {
      const [next, sent] = await Promise.all([fetchInboxCounts(user.id), fetchSentPostIds(user.id)])
      setCounts(next)
      setSentIds(new Set(sent))
    } catch {
      // 배지와 "신청함" 표시만 못 보여 줄 뿐
    }
  }

  // 이용 정지 여부 (게시판을 열 때 한 번)
  useEffect(() => {
    if (!unlocked) return setSuspension({ suspended: false, until: null })
    let active = true
    fetchMyStatus(user?.id)
      .then((status) => active && setSuspension(status))
      .catch(() => {}) // 확인하지 못하면 안내만 생략 (실제 제한은 DB 가 한다)
    return () => {
      active = false
    }
  }, [unlocked, user?.id])

  useEffect(() => {
    refreshRequests()
    if (!unlocked) return
    const onVisible = () => document.visibilityState === 'visible' && refreshRequests()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [unlocked, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 로그인·체크리스트가 필요하면 먼저 받고, 끝나면 이어서 한다 */
  function requireAccess(action) {
    const ready = signedIn && (!NEEDS_PROFILE.includes(action) || profile.data)
    if (ready) return finishPending(action)
    writeAfterLogin(action)
    setPending(action)
    if (!signedIn) setLoginOpen(true)
  }

  function closeLogin() {
    writeAfterLogin(null)
    setPending(null)
    setLoginOpen(false)
  }

  function closeProfile() {
    setProfileOpen(false)
    // 등록을 취소하면 이어서 하려던 일도 취소
    if (!profile.data) {
      writeAfterLogin(null)
      setPending(null)
    }
  }

  async function handleProfileSubmit(values) {
    const saved = await saveProfile(values, user.id, Boolean(profile.data))
    setProfile({ status: 'ready', data: saved })
    setProfileOpen(false)
    // 내 글에도 반영됐으니 목록을 새로 불러온다
    reload()
    if (pending) finishPending(pending)
  }

  const reload = () => setReloadKey((k) => k + 1)

  function goToPage(next) {
    setPage(next)
    feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const { status, items: visible, total } = board
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const setFilter = (key) => (value) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }
  const resetFilters = () => {
    setFilters(INITIAL_FILTERS)
    setPage(1)
  }
  const filtered = Object.values(filters).some((v) => v !== ALL)
  const activeFilters = Object.values(filters).filter((v) => v !== ALL).length
  const filterSummary =
    [
      filters.semester !== ALL && semesterLabel(filters.semester),
      filters.dormitory !== ALL && DORMITORIES.find((d) => d.code === filters.dormitory)?.name,
      filters.gender !== ALL && GENDERS.find((g) => g.value === filters.gender)?.label,
    ]
      .filter(Boolean)
      .join(' · ') || '전체 글'
  const filterCount = unlocked && status === 'ready' ? ` · ${total}개` : ''
  const isMine = (post) => Boolean(user) && post.authorId === user.id

  const replacePost = (post) =>
    setBoard((b) => ({ ...b, items: b.items.map((p) => (p.id === post.id ? post : p)) }))

  async function handleSubmit(values) {
    const post = { ...profileFields(profile.data), ...values }
    if (editor?.post) {
      replacePost(await updateRoommatePost(editor.post.id, post, user.id))
    } else {
      await createRoommatePost(post, user.id)
      // 새 글은 첫 페이지 맨 위에 온다
      if (page === 1) reload()
      else setPage(1)
    }
    setEditor(null)
  }

  // 내 글이면 그 글에 온 신청, 남의 글이면 신청 보내기(이미 보냈으면 취소) 확인 창
  function handleRequest(post) {
    if (isMine(post)) {
      setDetail(null)
      setMyPostsOpen(false)
      setInbox({ postId: post.id })
      return
    }
    setConfirm({ post, mode: sentIds.has(post.id) ? 'cancel' : 'send' })
  }

  async function confirmRequest(message) {
    const { post, mode } = confirm
    if (mode === 'send') await sendRequest(post, message, user.id, profile.data?.gender)
    else await cancelRequest(post.id, user.id)
    setSentIds((prev) => {
      const next = new Set(prev)
      if (mode === 'send') next.add(post.id)
      else next.delete(post.id)
      return next
    })
    setConfirm(null)
  }

  function closeInbox() {
    setInbox(null)
    refreshRequests()
    // 카드의 받은 신청 수를 맞춘다
    reload()
  }

  // 보낸 신청 탭에서 취소하면 카드의 "신청함" 표시도 지운다
  function handleCanceled(postId) {
    setSentIds((prev) => {
      const next = new Set(prev)
      next.delete(postId)
      return next
    })
  }

  function openBlockAuthor(post) {
    setBlockPost(post)
  }

  // 게시글 신고 (+ 원하면 글쓴이 차단). 신고는 됐는데 차단만 실패하면 신고 창이 그 사실을 알린다
  async function submitReport({ reason, detail, block }) {
    await reportPost(reportTarget, reason, detail, user.id)
    if (!block) return { blocked: false }
    try {
      await blockAuthor(reportTarget, user.id)
    } catch {
      return { blocked: false, blockFailed: true }
    }
    setDetail(null)
    refreshRequests()
    reload()
    return { blocked: true }
  }

  async function confirmDeletePost() {
    await deleteRoommatePost(deletingPost.id, user.id)
    setDeletingPost(null)
    setDetail(null)
    refreshRequests()
    reload()
  }

  async function confirmBlockAuthor() {
    await blockAuthor(blockPost, user.id)
    setBlockPost(null)
    setDetail(null)
    refreshRequests()
    reload()
  }

  function openEditor(post) {
    setDetail(null)
    setMyPostsOpen(false)
    setEditor({ post })
  }

  async function handleLogout() {
    await signOut()
    setEditor(null)
    setMyPostsOpen(false)
    setInbox(null)
    setConfirm(null)
    setBlockPost(null)
    setReportTarget(null)
    setDetail(null)
    setBoard({ status: 'loading', items: [], total: 0, loading: true })
  }

  const openWrite = () => requireAccess('write')
  const newTotal = counts.requests + counts.replies

  const board$ = (
    <>
      {/* 모바일에서는 필터를 접어 두고 버튼으로 펼친다 */}
      <button
        type="button"
        className={`rm-filter-toggle${filtersOpen ? ' is-open' : ''}`}
        onClick={() => setFiltersOpen((v) => !v)}
        aria-expanded={filtersOpen}
        aria-controls="rm-filters"
      >
        <span>필터</span>
        {activeFilters > 0 && <span className="rm-filter-count tabular">{activeFilters}</span>}
        <span className="rm-filter-summary">
          {filterSummary}
          {filterCount}
        </span>
        <span className="rm-filter-chevron" aria-hidden="true" />
      </button>
      <aside id="rm-filters" className={`rm-filters${filtersOpen ? ' is-open' : ''}`} aria-label="게시글 필터">
        <div className="rm-filter">
          <h2>학기</h2>
          <ChoiceGroup
            label="학기 필터"
            size="sm"
            options={withAll(SEMESTER_OPTIONS)}
            value={filters.semester}
            onChange={setFilter('semester')}
          />
        </div>
        <div className="rm-filter">
          <h2>호관</h2>
          <ChoiceGroup
            label="호관 필터"
            size="sm"
            options={withAll(DORMITORIES.map((d) => ({ value: d.code, label: d.name })))}
            value={filters.dormitory}
            onChange={setFilter('dormitory')}
          />
        </div>
        <div className="rm-filter">
          <h2>성별</h2>
          <ChoiceGroup label="성별 필터" size="sm" options={withAll(GENDERS)} value={filters.gender} onChange={setFilter('gender')} />
        </div>
        {filtered && (
          <button type="button" className="btn btn-ghost btn-sm rm-filter-reset" onClick={resetFilters}>
            필터 초기화
          </button>
        )}
      </aside>

      <section ref={feedRef} className="rm-feed" aria-label="룸메이트 찾기 게시글">
        {suspension.suspended && (
          <div className="notice notice-danger" role="alert">
            <IconAlert width={18} height={18} />
            <p>
              신고가 확인되어 룸메이트 찾기 이용이 정지된 계정이에요
              {suspension.until
                ? ` (${new Date(suspension.until).toLocaleDateString('ko-KR')}까지)`
                : ''}
              . 글쓰기·룸메 신청·답장을 할 수 없고, 내 글은 다른 사람에게 보이지 않아요.
            </p>
          </div>
        )}
        {roommateStorage === 'local' && (
          <div className="notice">
            <IconInfo width={18} height={18} />
            <p>아직 데이터베이스가 연결되지 않아 새 글은 이 브라우저에만 저장됩니다. “예시” 글은 화면 확인용이에요.</p>
          </div>
        )}

        {!unlocked ? (
          // 잠긴 동안에는 실제 글 대신 예시 글을 흐리게 보여 준다
          <div className="rm-grid">
            {SAMPLE_POSTS.map((post) => (
              <RoommateCard key={post.id} post={post} mine={false} onOpen={() => {}} onEdit={() => {}} />
            ))}
          </div>
        ) : (
          <>
            {status === 'loading' && (
              <div className="rm-grid">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="rm-card rm-skeleton" />
                ))}
              </div>
            )}

            {status === 'error' && (
              <div className="notice notice-danger" role="alert">
                <IconAlert width={18} height={18} />
                <p>게시글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
              </div>
            )}

            {status === 'ready' &&
              (visible.length ? (
                <>
                  <div className={`rm-grid${board.loading ? ' is-loading' : ''}`} aria-busy={board.loading}>
                    {visible.map((post) => (
                      <RoommateCard
                        key={post.id}
                        post={post}
                        mine={isMine(post)}
                        sent={sentIds.has(post.id)}
                        match={isMine(post) ? null : matchCount(profile.data.checklist, post.checklist)}
                        onOpen={setDetail}
                        onEdit={openEditor}
                        onDelete={setDeletingPost}
                        adminLink={isAdmin}
                        onReport={setReportTarget}
                      />
                    ))}
                  </div>
                  <Pagination page={page} pageCount={pageCount} onChange={goToPage} />
                </>
              ) : (
                <div className="rm-empty">
                  <p>{filtered ? '조건에 맞는 글이 없어요.' : '아직 등록된 글이 없어요.'}</p>
                  {filtered ? (
                    <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                      필터 초기화
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={openWrite}>
                      첫 글 남기기
                    </button>
                  )}
                </div>
              ))}
          </>
        )}
      </section>
    </>
  )

  return (
    <>
      <title>룸메이트 찾기 | JBNU Dormi</title>
      <PageHeader
        title="나와 잘 맞는 룸메이트 찾기"
        lead="생활 습관이 맞는 룸메이트를 찾아 신청해 보세요. 같은 성별끼리만 신청할 수 있어요."
      />

      <div className="container rm-toolbar">
        {/* 로그인 전에는 게시판처럼 흐리게 두고 누를 수 없게 한다 (로그인은 아래 안내 창·로그인 버튼에서) */}
        <div
          className={`rm-header-actions${signedIn ? '' : ' is-locked'}`}
          inert={!signedIn}
          aria-hidden={signedIn ? undefined : true}
        >
          <button type="button" className="btn btn-primary btn-lg" onClick={openWrite}>
            글쓰기
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => requireAccess('myPosts')}>
            내가 쓴 글
          </button>
          <button type="button" className="btn btn-secondary btn-lg rm-inbox-btn" onClick={() => requireAccess('requests')}>
            신청 내역
            {newTotal > 0 && (
              <span className="rm-unread tabular" aria-label={`새 신청·답장 ${newTotal}건`}>
                {newTotal > 99 ? '99+' : newTotal}
              </span>
            )}
          </button>
        </div>
        <div className="rm-toolbar-meta">
          {unlocked && status === 'ready' && <span className="rm-count tabular">게시글 {total}개</span>}
          <AccountBar
            status={authStatus}
            user={user}
            hasProfile={Boolean(profile.data)}
            onLogin={() => requireAccess('unlock')}
            onLogout={handleLogout}
            onProfile={() => setProfileOpen(true)}
          />
        </div>
      </div>

      {unlocked ? (
        <div className="container rm-layout">{board$}</div>
      ) : (
        <div className="container rm-locked">
          <div className="rm-layout rm-locked-content" inert aria-hidden="true">
            {board$}
          </div>
          <BoardGate
            stage={gateStage}
            onLogin={() => requireAccess('unlock')}
            onRegister={() => requireAccess('unlock')}
            onRetry={() => setProfileRetry((n) => n + 1)}
          />
        </div>
      )}

      <LoginModal
        open={loginOpen}
        reason={LOGIN_REASONS[pending] ?? LOGIN_REASONS.unlock}
        points={[
          '구글 계정으로 한 번에 로그인해요. 따로 가입할 필요가 없어요.',
          '로그인 후 기본 정보와 체크리스트를 한 번만 등록하면 모든 글을 볼 수 있어요.',
          '이메일과 이름은 본인 확인에만 쓰고, 어디에도 표시하지 않아요.',
        ]}
        onClose={closeLogin}
        onSignIn={signIn}
        onIdToken={signInWithIdToken}
      />
      {user && (
        <>
          <ProfileForm
            key={profile.data ? `profile-${profile.data.updatedAt}` : 'profile-new'}
            open={profileOpen}
            initial={profile.data}
            onClose={closeProfile}
            onSubmit={handleProfileSubmit}
          />
          <RoommateForm
            key={`post-${editor?.post?.id ?? 'new'}`}
            open={Boolean(editor)}
            initial={editor?.post ?? null}
            profile={profile.data}
            onEditProfile={() => {
              setEditor(null)
              setProfileOpen(true)
            }}
            onClose={() => setEditor(null)}
            onSubmit={handleSubmit}
          />
          <MyPostsModal
            open={myPostsOpen}
            userId={user.id}
            onClose={() => setMyPostsOpen(false)}
            onView={setDetail}
            onRequests={handleRequest}
            onEdit={openEditor}
            onChanged={reload}
            onDeleted={reload}
          />
        </>
      )}
      <PostDetailModal
        post={detail}
        mine={detail ? isMine(detail) : false}
        sent={detail ? sentIds.has(detail.id) : false}
        myGender={profile.data?.gender ?? null}
        onClose={() => setDetail(null)}
        onEdit={openEditor}
        onRequest={handleRequest}
        onBlock={user ? openBlockAuthor : null}
        onReport={user ? setReportTarget : null}
      />
      {user && (
        <>
          <RequestConfirmModal
            key={confirm ? `${confirm.mode}-${confirm.post.id}` : 'confirm'}
            target={confirm}
            match={confirm && profile.data ? matchCount(profile.data.checklist, confirm.post.checklist) : null}
            onClose={() => setConfirm(null)}
            onConfirm={confirmRequest}
          />
          <RequestsInboxModal
            request={inbox}
            user={user}
            myChecklist={profile.data?.checklist ?? null}
            counts={counts}
            onClose={closeInbox}
            onChanged={reload}
            onCanceled={handleCanceled}
          />
          <DeletePostModal
            key={`delete-${deletingPost?.id ?? 'none'}`}
            post={deletingPost}
            onClose={() => setDeletingPost(null)}
            onConfirm={confirmDeletePost}
          />
          <BlockConfirmModal
            key={`block-${blockPost?.id ?? 'none'}`}
            target={
              blockPost && {
                title: '이 글쓴이를 차단할까요?',
                context: `게시글 · ${DORMITORIES.find((d) => d.code === blockPost.dormitory)?.name ?? ''}${
                  blockPost.semester ? ` · ${semesterLabel(blockPost.semester)}` : ''
                }`,
              }
            }
            onClose={() => setBlockPost(null)}
            onConfirm={confirmBlockAuthor}
          />
          <ReportModal
            key={reportTarget ? `report-${reportTarget.id}` : 'report'}
            target={
              reportTarget && {
                title: '이 글을 신고할까요?',
                context: `게시글 · ${DORMITORIES.find((d) => d.code === reportTarget.dormitory)?.name ?? ''}${
                  reportTarget.semester ? ` · ${semesterLabel(reportTarget.semester)}` : ''
                }`,
              }
            }
            onClose={() => setReportTarget(null)}
            onSubmit={submitReport}
          />
        </>
      )}
    </>
  )
}

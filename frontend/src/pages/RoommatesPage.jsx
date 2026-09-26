import { useEffect, useRef, useState } from 'react'
import LoginModal from '../components/auth/LoginModal.jsx'
import ChoiceGroup from '../components/common/ChoiceGroup.jsx'
import { IconAlert, IconInfo } from '../components/common/Icons.jsx'
import PageHeader from '../components/common/PageHeader.jsx'
import Pagination from '../components/common/Pagination.jsx'
import BoardGate from '../components/roommates/BoardGate.jsx'
import MyPostsModal from '../components/roommates/MyPostsModal.jsx'
import PostDetailModal from '../components/roommates/PostDetailModal.jsx'
import { matchCount } from '../components/roommates/postFormat.js'
import ProfileForm from '../components/roommates/ProfileForm.jsx'
import ReceivedRequestsModal from '../components/roommates/ReceivedRequestsModal.jsx'
import RequestConfirmModal from '../components/roommates/RequestConfirmModal.jsx'
import RoommateCard from '../components/roommates/RoommateCard.jsx'
import RoommateForm from '../components/roommates/RoommateForm.jsx'
import { DORMITORIES } from '../data/dormitories.js'
import { GENDERS } from '../data/roommateOptions.js'
import { authMode, useAuth } from '../hooks/useAuth.js'
import { fetchMyProfile, profileFields, saveProfile } from '../lib/roommateProfile.js'
import { cancelRequest, countNewRequests, fetchSentPostIds, sendRequest } from '../lib/roommateRequests.js'
import { browsableSemesters, semesterLabel } from '../lib/semester.js'
import {
  PAGE_SIZE,
  SAMPLE_POSTS,
  createRoommatePost,
  fetchRoommatePage,
  roommateStorage,
  updateRoommatePost,
} from '../lib/roommates.js'
import './RoommatesPage.css'

const ALL = 'all'
const withAll = (options) => [{ value: ALL, label: '전체' }, ...options]
const INITIAL_FILTERS = { semester: ALL, dormitory: ALL, gender: ALL }
const SEMESTER_OPTIONS = browsableSemesters().map((s) => ({ value: s, label: semesterLabel(s) }))

// 로그인·체크리스트 등록 뒤에 이어서 할 일 ('write' | 'myPosts' | 'unlock' | 'requests')
// 구글 로그인 페이지로 이동했다 돌아오는 경우를 위해 sessionStorage 에도 남긴다.
const AFTER_LOGIN_KEY = 'jbnu-dorm:after-login'
const LOGIN_REASONS = {
  write: '글을 쓰려면 로그인이 필요해요.',
  myPosts: '내가 쓴 글을 보려면 로그인이 필요해요.',
  requests: '받은 신청을 보려면 로그인이 필요해요.',
  unlock: '로그인하고 체크리스트를 등록하면 글을 볼 수 있어요.',
}
const NEEDS_PROFILE = ['write', 'unlock', 'requests']

function readAfterLogin() {
  try {
    return sessionStorage.getItem(AFTER_LOGIN_KEY)
  } catch {
    return null
  }
}

function writeAfterLogin(action) {
  try {
    if (action) sessionStorage.setItem(AFTER_LOGIN_KEY, action)
    else sessionStorage.removeItem(AFTER_LOGIN_KEY)
  } catch {
    // 저장하지 못하면 로그인 뒤 이어서 하기만 생략된다
  }
}

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
          내 체크리스트
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
  const { status: authStatus, user, signIn, signInWithIdToken, signOut } = useAuth()
  // 내 체크리스트(프로필). status: 'idle'(로그인 전) | 'loading' | 'ready'
  const [profile, setProfile] = useState({ status: 'idle', data: null })
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
  // 받은 신청 창. null: 닫힘 / {}: 전체 / { postId }: 그 글에 온 신청만
  const [inbox, setInbox] = useState(null)
  // 룸메 신청 확인 창. { post, mode: 'send' | 'cancel' }
  const [confirm, setConfirm] = useState(null)
  const [sentIds, setSentIds] = useState(() => new Set())
  const [newRequests, setNewRequests] = useState(0)
  const [loginOpen, setLoginOpen] = useState(false)
  const [pending, setPending] = useState(() => readAfterLogin())

  const signedIn = authStatus === 'signedIn'
  const unlocked = signedIn && Boolean(profile.data)
  const gateStage =
    authStatus === 'loading' || (signedIn && profile.status !== 'ready')
      ? 'loading'
      : !signedIn
        ? 'signedOut'
        : 'noProfile'

  // 로그인하면 내 체크리스트를 불러온다
  useEffect(() => {
    if (!signedIn) {
      setProfile({ status: 'idle', data: null })
      return
    }
    let active = true
    setProfile({ status: 'loading', data: null })
    fetchMyProfile(user.id)
      .then((data) => active && setProfile({ status: 'ready', data }))
      .catch(() => active && setProfile({ status: 'ready', data: null }))
    return () => {
      active = false
    }
  }, [signedIn, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 게시판은 체크리스트를 등록한 뒤에만 불러온다 (DB 도 그 전에는 글을 내주지 않는다)
  useEffect(() => {
    if (!unlocked) return
    let active = true
    setBoard((b) => ({ ...b, loading: true }))
    fetchRoommatePage({
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
  }, [unlocked, page, filters.semester, filters.dormitory, filters.gender, reloadKey])

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

  function finishPending(action) {
    writeAfterLogin(null)
    setPending(null)
    if (action === 'write') setEditor({ post: null })
    if (action === 'myPosts') setMyPostsOpen(true)
    if (action === 'requests') setInbox({})
  }

  // 새 신청 수(툴바 배지)와 내가 신청한 글. 주기적으로 확인하지 않고,
  // 게시판을 열 때와 다른 탭에 갔다가 돌아올 때만 불러온다 (서버 요청 절약)
  async function refreshRequests() {
    if (!unlocked) {
      setNewRequests(0)
      setSentIds(new Set())
      return
    }
    try {
      const [count, sent] = await Promise.all([countNewRequests(user.id), fetchSentPostIds(user.id)])
      setNewRequests(count)
      setSentIds(new Set(sent))
    } catch {
      // 배지와 "신청함" 표시만 못 보여 줄 뿐
    }
  }

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
    if (mode === 'send') await sendRequest(post, message, user.id)
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
    setDetail(null)
    setBoard({ status: 'loading', items: [], total: 0, loading: true })
  }

  const openWrite = () => requireAccess('write')

  const board$ = (
    <>
      <aside className="rm-filters" aria-label="게시글 필터">
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
              <RoommateCard key={post.id} post={post} mine={false} onOpen={() => {}} onRequest={() => {}} onEdit={() => {}} />
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
                        onRequest={handleRequest}
                        onEdit={openEditor}
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
        lead="전북대 룸메이트 체크리스트로 생활 습관을 남기고, 마음에 드는 글에 룸메 신청을 보내 보세요. 비슷한 생활 패턴의 룸메이트를 만나면 기숙사 생활이 훨씬 편해져요."
      />

      <div className="container rm-toolbar">
        <div className="rm-header-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={openWrite}>
            글쓰기
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => requireAccess('myPosts')}>
            내가 쓴 글
          </button>
          <button type="button" className="btn btn-secondary btn-lg rm-inbox-btn" onClick={() => requireAccess('requests')}>
            받은 신청
            {newRequests > 0 && (
              <span className="rm-unread tabular" aria-label={`새 신청 ${newRequests}건`}>
                {newRequests > 99 ? '99+' : newRequests}
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
          <BoardGate stage={gateStage} onLogin={() => requireAccess('unlock')} onRegister={() => requireAccess('unlock')} />
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
        onClose={() => setDetail(null)}
        onEdit={openEditor}
        onRequest={handleRequest}
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
          <ReceivedRequestsModal
            request={inbox}
            user={user}
            myChecklist={profile.data?.checklist ?? null}
            onClose={closeInbox}
          />
        </>
      )}
    </>
  )
}
